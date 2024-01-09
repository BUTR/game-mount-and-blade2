/* eslint-disable */
import React from 'react';
import path from 'path';
import { fs, selectors, types, util } from 'vortex-api';
import { ILoadOrderEntry, LoadOrder } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';

import { GAME_ID } from '../common';
import { getLoadOrderFilePath, resolveModId } from '../utils/util';

import LoadOrderInfoPanel from '../views/LoadOrderInfoPanel/LoadOrderInfoPanel';
import { VortexLauncherManager } from '../utils/VortexLauncherManager';
import { forceRefresh } from '../utils/util';
import { ModuleIssue, ModuleViewModel } from '@butr/vortexextensionnative/dist/main/lib/types';

export default class BannerlordLoadOrder implements types.ILoadOrderGameInfo {
  public gameId: string;
  public toggleableEntries?: boolean | undefined;
  public usageInstructions?: React.ComponentType<{}>;
  public noCollectionGeneration?: boolean | undefined;
  private mApi: types.IExtensionApi;
  private mManager: VortexLauncherManager;
  private mInvalid: { [moduleId: string]: ModuleIssue[] };

  constructor(api: types.IExtensionApi, manager: VortexLauncherManager) {
    this.mApi = api;
    this.mManager = manager;
    this.gameId = GAME_ID;
    this.toggleableEntries = true;
    this.noCollectionGeneration = true;
    this.mInvalid = {};
    const refresh = () => forceRefresh(this.mApi);
    this.usageInstructions = () => {
      return (<LoadOrderInfoPanel refresh={refresh} invalidEntries={this.mInvalid} />);
    };
    this.deserializeLoadOrder = this.deserializeLoadOrder.bind(this);
    this.serializeLoadOrder = this.serializeLoadOrder.bind(this);
    this.validate = this.validate.bind(this);
  }

  public async serializeLoadOrder(loadOrder: LoadOrder): Promise<void> {
    const loFilePath = getLoadOrderFilePath(this.mApi);
    const lo: LoadOrder = loadOrder.reduce((accum, entry, idx) => {
      if (entry.data.index !== idx) {
        this.mManager.changeModulePosition(entry.data, idx);
      }
      const newEntry = {
        ...entry,
        data: {
          ...entry.data,
          index: idx,
        },
      }
      accum.push(newEntry);
      return accum;
    }, [] as LoadOrder);
    this.mManager.setLoadOrder();
    await fs.ensureDirWritableAsync(path.dirname(loFilePath));
    return fs.writeFileAsync(loFilePath, JSON.stringify(lo, null, 2), { encoding: 'utf8' });
  }

  public async deserializeLoadOrder(): Promise<LoadOrder> {
    const loFilePath = getLoadOrderFilePath(this.mApi);
    const fileContents = await fs.readFileAsync(loFilePath, 'utf8').catch(() => '[]');
    const currentLO: LoadOrder = JSON.parse(fileContents);
    const modules = this.mManager.moduleViewModels;
    const lo = await Object.entries(modules).reduce(async (accumP, [id, value]) => {
      const accum = await accumP;
      const idx = currentLO.findIndex((entry) => entry.id === id);
      if (value.index !== idx) {
        this.mManager.changeModulePosition(value, idx);
      }
      const entry = await this.toLoadOrderEntry(value, idx, currentLO[idx]?.enabled);
      accum.push(entry);
      return Promise.resolve(accum);
    }, Promise.resolve([]) as Promise<LoadOrder>);
    return lo.sort((a, b) => a.data.index - b.data.index);
  }

  public async validate(prev: LoadOrder, current: LoadOrder): Promise<types.IValidationResult> {
    this.mInvalid = {};
    for (const entry of current) {
      if (!entry.data.isValid) {
        const issues = this.mManager.getModuleIssues(entry.id);
        if (issues.length > 0) {
          this.mInvalid[entry.id] = issues;
        }
      }
    }
    return Promise.resolve(undefined) as any;
  }

  private async toLoadOrderEntry(vm: ModuleViewModel, idx: number, enabled?: boolean): Promise<ILoadOrderEntry> {
    const moduleCache = this.mManager.getModulesVortex();
    if (vm.moduleInfoExtended === undefined) {
      throw new Error('Module info extended is undefined');
    }
    const modId = moduleCache[vm.moduleInfoExtended.id]?.vortexId || await resolveModId(this.mApi, vm);
    const entry: ILoadOrderEntry = {
      id: vm.moduleInfoExtended.id,
      enabled: vm.isValid
        ? enabled !== undefined ? enabled : !vm.isDisabled
        : false,
      name: vm.moduleInfoExtended.name,
      modId,
      locked: false,
      data: {
        ...vm,
        index: idx,
      },
    };
    return entry;
  }
}

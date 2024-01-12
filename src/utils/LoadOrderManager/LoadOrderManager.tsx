import React from 'react';
import { types, selectors } from 'vortex-api';
import { IInvalidResult } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import { ValidationManager, VortexLauncherManager, vortexToLibrary, libraryToVortex } from '..';
import { GAME_ID } from '../../common';
import { LoadOrderInfoPanel } from '../../views';
import { VortexLoadOrderStorage } from '../../types';

const forceRefresh = (api: types.IExtensionApi) => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  const action = {
    type: 'SET_FB_FORCE_UPDATE',
    payload: {
      profileId,
    },
  };
  if (api.store) {
    api.store.dispatch(action);
  }
}

export class LoadOrderManager implements types.ILoadOrderGameInfo {
  public gameId: string = GAME_ID;
  public toggleableEntries: boolean = true;
  public usageInstructions?: React.ComponentType<{}>;
  public noCollectionGeneration: boolean = true;
  private mApi: types.IExtensionApi;
  private mManager: VortexLauncherManager;

  constructor(api: types.IExtensionApi, manager: VortexLauncherManager) {
    this.mApi = api;
    this.mManager = manager;
    const refresh = () => forceRefresh(this.mApi);
    this.usageInstructions = () => {
      return (<LoadOrderInfoPanel refresh={refresh} />);
    };
  }

  public serializeLoadOrder = (loadOrder: VortexLoadOrderStorage): Promise<void> => {
    const loadOrderConverted = vortexToLibrary(loadOrder);
    this.mManager.saveLoadOrderVortex(loadOrderConverted);
    return Promise.resolve();
  }

  public deserializeLoadOrder = (): Promise<VortexLoadOrderStorage> => {
    // Make sure the LauncherManager has the latest module list
    this.mManager.refreshModules();

    // Get the saved Load Order
    const savedLoadOrder = this.mManager.loadLoadOrderVortex();

    /* TODO: Expose via settings
    // Apply the Load Order to the list of modules
    // Useful when there are new modules or old modules are missing
    // Will auto-sort the rest of modules
    const result = this.mManager.orderByLoadOrder(savedLoadOrder);
    if (result && result.orderedModuleViewModels) {
      const loadOrderConverted = launcherManagerModuleViewModelToVortex(result.orderedModuleViewModels);
      return Promise.resolve(loadOrderConverted);
    }

    if (result.issues) {
      this.mApi.sendNotification?.({ type: "info", message: `The Load Order was re-sorted with the default algorithm!\nReasons:\n${result.issues.join(`\n`)}`, });
    }
    */
    
    const loadOrderConverted = libraryToVortex(this.mManager, savedLoadOrder);
    return Promise.resolve(loadOrderConverted);
  }

  public validate = (_prev: VortexLoadOrderStorage, curr: VortexLoadOrderStorage): Promise<types.IValidationResult> => {
    const modules = curr.flatMap((entry) => entry.data && entry.enabled ? entry.data.moduleInfoExtended : []);
    const validationManager = ValidationManager.fromVortex(curr);

    const invalidResults: IInvalidResult[] = [];
    for (const enabledModule of modules) {
      const loadOrderIssues = BannerlordModuleManager.validateLoadOrder(modules, enabledModule);
      for (const issue of loadOrderIssues) {
        invalidResults.push({
          id: issue.target.id,
          reason: issue.reason,
        })
      }
    }
    for (const entry of curr) {
      if (entry.data) {
        const moduleIssues = BannerlordModuleManager.validateModule(modules, entry.data.moduleInfoExtended, validationManager);
        for (const issue of moduleIssues) {
          invalidResults.push({
            id: issue.target.id,
            reason: issue.reason,
          })
        }
      }
    }

    // While the contract doesn't explicitly allow undefined to be returned,
    // it's expecting an undefined when there are no issues.
    return Promise.resolve(invalidResults.length === 0 ? undefined! : {
      invalid: invalidResults
    });
  }
}

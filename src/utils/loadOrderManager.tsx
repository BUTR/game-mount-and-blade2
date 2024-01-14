import React from 'react';
import { types, selectors } from 'vortex-api';
import { IInvalidResult } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { BannerlordModuleManager, types as vetypes } from "@butr/vortexextensionnative";
import { ValidationManager, VortexLauncherManager, vortexToLibrary, libraryToVortex } from '.';
import { GAME_ID } from '../common';
import { LoadOrderInfoPanel } from '../views';
import { VortexLoadOrderStorage } from '../types';

export class LoadOrderManager implements types.ILoadOrderGameInfo {
  private _api: types.IExtensionApi;
  private _manager: VortexLauncherManager;
  private _isInitialized: boolean = false;
  
  public gameId: string = GAME_ID;
  public toggleableEntries: boolean = true;
  public usageInstructions?: React.ComponentType<{}>;
  public noCollectionGeneration: boolean = true;

  constructor(api: types.IExtensionApi, manager: VortexLauncherManager) {
    this._api = api;
    this._manager = manager;
    const refresh = () => this.forceRefresh();
    this.usageInstructions = () => (<LoadOrderInfoPanel refresh={refresh} />);
  }

  private forceRefresh = () => {
    const state = this._api.getState();
    const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
    const action = {
      type: 'SET_FB_FORCE_UPDATE',
      payload: {
        profileId,
      },
    };
    this._api.store?.dispatch(action);
  }

  public serializeLoadOrder = (loadOrder: VortexLoadOrderStorage): Promise<void> => {
    const loadOrderConverted = vortexToLibrary(loadOrder);
    this._manager.saveLoadOrderVortex(loadOrderConverted);
    return Promise.resolve();
  }

  public deserializeLoadOrder = (): Promise<VortexLoadOrderStorage> => {
    // Make sure the LauncherManager has the latest module list
    this._manager.refreshModules();

    // Get the saved Load Order
    const savedLoadOrder = this._manager.loadLoadOrderVortex();

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

    if (!this._isInitialized) {
      this._isInitialized = true;
      // We automatically set the modules to launch on save, but not on first load
      this._manager.setModulesToLaunch(savedLoadOrder);
    }
    
    const loadOrderConverted = libraryToVortex(this._api, this._manager, savedLoadOrder);
    return Promise.resolve(loadOrderConverted);
  }

  public validate = (_prev: VortexLoadOrderStorage, curr: VortexLoadOrderStorage): Promise<types.IValidationResult> => {
    const modules = curr.flatMap<vetypes.ModuleInfoExtendedWithPath>((entry) => entry.data && entry.enabled ? entry.data.moduleInfoExtended : []);
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
      if (entry.data && entry.enabled) {
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
};
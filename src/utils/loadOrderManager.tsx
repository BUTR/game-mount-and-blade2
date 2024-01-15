import React from 'react';
import { types, selectors } from 'vortex-api';
import { IInvalidResult } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { BannerlordModuleManager, Utils, types as vetypes } from "@butr/vortexextensionnative";
import { ValidationManager, VortexLauncherManager, vortexToLibrary, libraryToVortex, libraryVMToVortex, libraryVMToLibrary } from '.';
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
    const setParameters = (loadOrder: vetypes.LoadOrder) => {
      if (!this._isInitialized) {
        this._isInitialized = true;
        // We automatically set the modules to launch on save, but not on first load
        this._manager.setModulesToLaunch(loadOrder);
      }
    };

    const firstLoad = this._isInitialized;

    // Make sure the LauncherManager has the latest module list
    this._manager.refreshModules();

    // Get the saved Load Order
    const savedLoadOrder = this._manager.loadLoadOrderVortex();
    const savedLoadOrderVortex = libraryToVortex(this._api, this._manager.getAllModules(), savedLoadOrder);

    const savedLoadOrderIssues = Utils.isLoadOrderCorrect(savedLoadOrderVortex.map<vetypes.ModuleInfoExtendedWithPath>(x => x.data!.moduleInfoExtended))
    if (savedLoadOrderIssues.length > 0) {
      this._api.sendNotification?.({ type: "warning", message: `The Saved Load Order was re-sorted with the default algorithm!\nReasons:\n${savedLoadOrderIssues.join(`\n *`)}`, });
    }

    // Apply the Load Order to the list of modules
    // Useful when there are new modules or old modules are missing
    // Will auto-sort the rest of modules
    const result = this._manager.orderByLoadOrder(savedLoadOrder);
    if (!result || !result.orderedModuleViewModels) {
      this._api.sendNotification?.({ type: "error", message: `Failed to correct the Load Order! Keepong the original list as-is.`, });
      setParameters(savedLoadOrder);
      return Promise.resolve(savedLoadOrderVortex);
    }

    if (result.issues) {
      this._api.sendNotification?.({ type: "warning", message: `The Load Order was re-sorted with the default algorithm!\nReasons:\n${result.issues.join(`\n`)}`, });
    }
    
    const loadOrderVortex = libraryVMToVortex(this._api, result.orderedModuleViewModels);
    setParameters(libraryVMToLibrary(result.orderedModuleViewModels));
    return Promise.resolve(loadOrderVortex);
  }

  public validate = (_prev: VortexLoadOrderStorage, curr: VortexLoadOrderStorage): Promise<types.IValidationResult> => {
    const modules = curr.flatMap<vetypes.ModuleInfoExtendedWithPath>((entry) => entry.data && entry.enabled ? entry.data.moduleInfoExtended : []);
    //const validationManager = ValidationManager.fromVortex(curr);

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

    // While the contract doesn't explicitly allow undefined to be returned,
    // it's expecting an undefined when there are no issues.
    return Promise.resolve(invalidResults.length === 0 ? undefined! : {
      invalid: invalidResults
    });
  }
};
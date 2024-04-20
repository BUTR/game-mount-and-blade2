import React from 'react';
import { types, selectors } from 'vortex-api';
import { IInvalidResult } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { BannerlordModuleManager, Utils, types as vetypes } from '@butr/vortexextensionnative';
import { vortexToLibrary, libraryToVortex, libraryVMToVortex, libraryVMToLibrary } from '.';
import { VortexLauncherManager } from '../';
import { GAME_ID } from '../../common';
import { LoadOrderInfoPanel, BannerlordItemRenderer } from '../../views';
import { RequiredProperties, VortexLoadOrderStorage } from '../../types';

export class LoadOrderManager implements types.IFBLOGameInfo {
  private _api: types.IExtensionApi;
  private _manager: VortexLauncherManager;
  private _isInitialized = false;

  public gameId: string = GAME_ID;
  public toggleableEntries = true;
  public customItemRenderer?: React.ComponentType<{
    className?: string;
    item: types.IFBLOItemRendererProps;
  }>;

  public usageInstructions?: React.ComponentType<unknown>;
  public noCollectionGeneration = true;

  constructor(api: types.IExtensionApi, manager: VortexLauncherManager) {
    this._api = api;
    this._manager = manager;
    this.customItemRenderer = ({ className = '', item }) => (
      <BannerlordItemRenderer api={api} item={item} className={className} key={item.loEntry.id} />
    );
    const refresh = () => this.forceRefresh();
    this.usageInstructions = () => <LoadOrderInfoPanel refresh={refresh} />;
  }

  private forceRefresh = (): void => {
    const profileId = selectors.activeProfile(this._api.getState()).id;
    const action = {
      type: 'SET_FB_FORCE_UPDATE',
      payload: {
        profileId,
      },
    };
    this._api.store?.dispatch(action);
  };

  public serializeLoadOrder = (loadOrder: VortexLoadOrderStorage): Promise<void> => {
    const loadOrderConverted = vortexToLibrary(loadOrder);
    this._manager.saveLoadOrderVortex(loadOrderConverted);
    return Promise.resolve();
  };

  private setParameters = (loadOrder: vetypes.LoadOrder): void => {
    if (!this._isInitialized) {
      this._isInitialized = true;
      // We automatically set the modules to launch on save, but not on first load
      this._manager.setModulesToLaunch(loadOrder);
    }
  };
  private checkSavedLoadOrder = (autoSort: boolean, loadOrder: VortexLoadOrderStorage): void => {
    const savedLoadOrderIssues = Utils.isLoadOrderCorrect(
      loadOrder.map<vetypes.ModuleInfoExtendedWithMetadata>((x) => x.data!.moduleInfoExtended)
    );
    if (autoSort && savedLoadOrderIssues.length > 0) {
      // If there were any issues with the saved LO, the orderer will sort the LO to the nearest working state
      this._api.sendNotification?.({
        type: 'warning',
        message: `The Saved Load Order was re-sorted with the default algorithm!\nReasons:\n${savedLoadOrderIssues.join(
          `\n *`
        )}`,
      });
    }
  };
  private checkOrderByLoadOrderResult = (autoSort: boolean, result: vetypes.OrderByLoadOrderResult): void => {
    if (autoSort && result.issues) {
      this._api.sendNotification?.({
        type: 'warning',
        message: `The Saved Load Order was re-sorted with the default algorithm!\nReasons:\n${result.issues.join(
          `\n`
        )}`,
      });
    }
  };
  private checkResult = (
    autoSort: boolean,
    result: vetypes.OrderByLoadOrderResult
  ): result is RequiredProperties<vetypes.OrderByLoadOrderResult, 'orderedModuleViewModels'> => {
    if (!result || !result.orderedModuleViewModels || !result.result) {
      if (autoSort) {
        // The user is not expecting a sort operation, so don't give the notification
        this._api.sendNotification?.({
          type: 'error',
          message: `Failed to correct the Load Order! Keeping the original list as-is.`,
        });
      }
      return false;
    }
    return true;
  };
  private getExcludedLoadOrder = (
    loadOrder: vetypes.LoadOrder,
    result: vetypes.OrderByLoadOrderResult
  ): vetypes.LoadOrder => {
    const excludedLoadOrder = Object.entries(loadOrder).reduce<vetypes.LoadOrder>((arr, curr) => {
      const [id, entry] = curr;
      if (result.orderedModuleViewModels?.find((x) => x.moduleInfoExtended.id === entry.id)) {
        arr[id] = entry;
      }
      return arr;
    }, {});
    return excludedLoadOrder;
  };
  public deserializeLoadOrder = (): Promise<VortexLoadOrderStorage> => {
    const firstLoad = this._isInitialized;
    const autoSort = true; // TODO: get from settings

    // Make sure the LauncherManager has the latest module list
    this._manager.refreshModules();

    // Get the saved Load Order
    const allModules = this._manager.getAllModules();
    const savedLoadOrder = this._manager.loadLoadOrderVortex();
    const savedLoadOrderVortex = libraryToVortex(this._api, allModules, savedLoadOrder);

    this.checkSavedLoadOrder(autoSort, savedLoadOrderVortex);

    // Apply the Load Order to the list of modules
    // Useful when there are new modules or old modules are missing
    // The output wil wil contain the auto sorted list of modules
    const result = this._manager.orderByLoadOrder(savedLoadOrder);
    if (!this.checkResult(autoSort, result)) {
      this.setParameters(savedLoadOrder);
      return Promise.resolve(savedLoadOrderVortex);
    }

    // Not even sure this will trigger
    this.checkOrderByLoadOrderResult(autoSort, result);

    // Use the sorted to closest valid state Load Order
    if (autoSort) {
      const loadOrderVortex = libraryVMToVortex(this._api, result.orderedModuleViewModels);
      this.setParameters(libraryVMToLibrary(result.orderedModuleViewModels));
      return Promise.resolve(loadOrderVortex);
    }

    // Do not use the sorted LO, but take the list of modules. It excludes modules that are not usable
    const excludedSavedLoadOrder = this.getExcludedLoadOrder(savedLoadOrder, result);
    this.setParameters(excludedSavedLoadOrder);
    return Promise.resolve(libraryToVortex(this._api, allModules, excludedSavedLoadOrder));
  };

  public validate = (_prev: VortexLoadOrderStorage, curr: VortexLoadOrderStorage): Promise<types.IValidationResult> => {
    const modules = (curr || []).flatMap<vetypes.ModuleInfoExtendedWithMetadata>((entry) =>
      entry.data && entry.enabled ? entry.data.moduleInfoExtended : []
    );
    //const validationManager = ValidationManager.fromVortex(curr);

    const invalidResults = Array<IInvalidResult>();
    for (const enabledModule of modules) {
      const loadOrderIssues = BannerlordModuleManager.validateLoadOrder(modules, enabledModule);
      for (const issue of loadOrderIssues) {
        invalidResults.push({
          id: issue.target.id,
          reason: issue.reason,
        });
      }
    }

    // While the contract doesn't explicitly allow undefined to be returned,
    // it's expecting an undefined when there are no issues.
    return Promise.resolve(
      invalidResults.length === 0
        ? undefined!
        : {
            invalid: invalidResults,
          }
    );
  };
}

import { ComponentType } from 'react';
import { selectors, types } from 'vortex-api';
import { IInvalidResult } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { BannerlordModuleManager, Utils, types as vetypes } from '@butr/vortexextensionnative';
import {
  IModAnalyzerRequestModule,
  IModAnalyzerRequestQuery,
  IModuleCompatibilityInfoCache,
  ModAnalyzerProxy,
} from '../butr';
import { versionToString } from '../version';
import { GAME_ID } from '../../common';
import { LoadOrderInfoPanel, LoadOrderItemRenderer } from '../../views';
import { IVortexViewModelData, VortexLoadOrderStorage } from '../../types';
import { VortexLauncherManager } from '../launcher';
import { LocalizationManager } from '../localization';
import { RequiredProperties } from '../types';
import { actionsLoadOrder } from '.';
import { libraryToVortex, libraryVMToLibrary, libraryVMToVortex, vortexToLibrary } from '.';

export class LoadOrderManager implements types.ILoadOrderGameInfo {
  private static instance: LoadOrderManager | undefined;

  public static getInstance(api: types.IExtensionApi): LoadOrderManager {
    if (!LoadOrderManager.instance) {
      LoadOrderManager.instance = new LoadOrderManager(api);
    }

    return LoadOrderManager.instance;
  }

  private api: types.IExtensionApi;
  private isInitialized = false;
  private allModules: vetypes.ModuleInfoExtendedWithMetadata[] = [];
  private compatibilityScores: IModuleCompatibilityInfoCache = {};

  public gameId: string = GAME_ID;
  public toggleableEntries = true;
  public customItemRenderer?: ComponentType<{
    className?: string;
    item: Omit<types.IFBLOItemRendererProps, 'loEntry'> & { loEntry: types.IFBLOLoadOrderEntry<IVortexViewModelData> };
  }>;

  public usageInstructions?: ComponentType<unknown>;
  public noCollectionGeneration = true;

  constructor(api: types.IExtensionApi) {
    this.api = api;
    this.usageInstructions = (): JSX.Element =>
      LoadOrderInfoPanel({
        refresh: this.updateCompatibilityScores,
      });

    this.customItemRenderer = ({ className = '', item }): JSX.Element => {
      const availableProviders = this.allModules
        .filter((x) => x.id === item.loEntry.id)
        .map((x) => x.moduleProviderType);
      const compatibilityScore = this.compatibilityScores[item.loEntry.id];

      return LoadOrderItemRenderer({
        item: item,
        className: className,
        availableProviders: availableProviders,
        compatibilityInfo: compatibilityScore,
      });
    };
  }

  public updateCompatibilityScores = (): void => {
    const proxy = new ModAnalyzerProxy();
    const launcherManager = VortexLauncherManager.getInstance(this.api);
    const gameVersion = launcherManager.getGameVersionVortex();
    const query: IModAnalyzerRequestQuery = {
      gameVersion: gameVersion,
      modules: this.allModules.map<IModAnalyzerRequestModule>((x) => ({
        moduleId: x.id,
        moduleVersion: versionToString(x.version),
      })),
    };
    proxy
      .analyze(query)
      .then((result) => {
        this.compatibilityScores = result.modules.reduce<IModuleCompatibilityInfoCache>((map, curr) => {
          map[curr.moduleId] = {
            score: curr.compatibility,
            recommendedScore: curr.recommendedCompatibility,
            recommendedVersion: curr.recommendedModuleVersion,
          };
          return map;
        }, {});
        this.forceRefresh();
      })
      .catch(() => {});
  };

  private forceRefresh = (): void => {
    const profile: types.IProfile | undefined = selectors.activeProfile(this.api.getState());
    this.api.store?.dispatch(actionsLoadOrder.setFBForceUpdate(profile.id));
  };

  public serializeLoadOrder = (loadOrder: VortexLoadOrderStorage): Promise<void> => {
    const loadOrderConverted = vortexToLibrary(loadOrder);
    const launcherManager = VortexLauncherManager.getInstance(this.api);
    launcherManager.saveLoadOrderVortex(loadOrderConverted);
    return Promise.resolve();
  };

  private setParameters = (loadOrder: vetypes.LoadOrder): void => {
    if (!this.isInitialized) {
      this.isInitialized = true;
      // We automatically set the modules to launch on save, but not on first load
      const launcherManager = VortexLauncherManager.getInstance(this.api);
      launcherManager.setModulesToLaunch(loadOrder);
    }
  };
  private checkSavedLoadOrder = (autoSort: boolean, loadOrder: VortexLoadOrderStorage): void => {
    const { localize: t } = LocalizationManager.getInstance(this.api);

    const savedLoadOrderIssues = Utils.isLoadOrderCorrect(
      loadOrder.map<vetypes.ModuleInfoExtendedWithMetadata>((x) => x.data!.moduleInfoExtended)
    );
    if (autoSort && savedLoadOrderIssues.length > 0) {
      // If there were any issues with the saved LO, the orderer will sort the LO to the nearest working state
      this.api.sendNotification?.({
        type: 'warning',
        message: t(`{=pZVVdI5d}The Load Order was re-sorted with the default algorithm!{NL}Reasons:{NL}{REASONS}`, {
          NL: '\n',
          REASONS: savedLoadOrderIssues.join(`\n`),
        }),
      });
    }
  };
  private checkOrderByLoadOrderResult = (autoSort: boolean, result: vetypes.OrderByLoadOrderResult): void => {
    const { localize: t } = LocalizationManager.getInstance(this.api);

    if (autoSort && result.issues) {
      this.api.sendNotification?.({
        type: 'warning',
        message: t(`{=pZVVdI5d}The Load Order was re-sorted with the default algorithm!{NL}Reasons:{NL}{REASONS}`, {
          NL: '\n',
          REASONS: result.issues.join(`\n`),
        }),
      });
    }
  };
  private checkResult = (
    autoSort: boolean,
    result: vetypes.OrderByLoadOrderResult
  ): result is RequiredProperties<vetypes.OrderByLoadOrderResult, 'orderedModuleViewModels'> => {
    const { localize: t } = LocalizationManager.getInstance(this.api);

    if (result === undefined || !result.orderedModuleViewModels || result.result === undefined || !result.result) {
      if (autoSort) {
        // The user is not expecting a sort operation, so don't give the notification
        this.api.sendNotification?.({
          type: 'error',
          message: t(`{=sLf3eIpH}Failed to order the module list!`),
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
    const autoSort = true; // TODO: get from settings
    const launcherManager = VortexLauncherManager.getInstance(this.api);

    // Make sure the LauncherManager has the latest module list
    launcherManager.refreshModules();
    this.allModules = launcherManager.getAllModulesWithDuplicates();

    // Get the saved Load Order
    const allModules = launcherManager.getAllModules();
    const savedLoadOrder = launcherManager.loadLoadOrderVortex();
    const savedLoadOrderVortex = libraryToVortex(this.api, allModules, savedLoadOrder);

    this.checkSavedLoadOrder(autoSort, savedLoadOrderVortex);

    // Apply the Load Order to the list of modules
    // Useful when there are new modules or old modules are missing
    // The output wil wil contain the auto sorted list of modules
    const result = launcherManager.orderByLoadOrder(savedLoadOrder);
    if (!this.checkResult(autoSort, result)) {
      this.setParameters(savedLoadOrder);
      return Promise.resolve(savedLoadOrderVortex);
    }

    // Not even sure this will trigger
    this.checkOrderByLoadOrderResult(autoSort, result);

    // Use the sorted to closest valid state Load Order
    if (autoSort) {
      const loadOrderVortex = libraryVMToVortex(this.api, result.orderedModuleViewModels);
      this.setParameters(libraryVMToLibrary(result.orderedModuleViewModels));
      return Promise.resolve(loadOrderVortex);
    }

    // Do not use the sorted LO, but take the list of modules. It excludes modules that are not usable
    const excludedSavedLoadOrder = this.getExcludedLoadOrder(savedLoadOrder, result);
    this.setParameters(excludedSavedLoadOrder);
    return Promise.resolve(libraryToVortex(this.api, allModules, excludedSavedLoadOrder));
  };

  public validate = (_prev: VortexLoadOrderStorage, curr: VortexLoadOrderStorage): Promise<types.IValidationResult> => {
    const modules = (curr ?? []).flatMap<vetypes.ModuleInfoExtendedWithMetadata>((entry) =>
      entry.data && entry.enabled ? entry.data.moduleInfoExtended : []
    );
    //const validationManager = ValidationManager.fromVortex(curr);

    const invalidResults = Array<IInvalidResult>();
    for (const enabledModule of modules) {
      const loadOrderIssues = BannerlordModuleManager.validateLoadOrder(modules, enabledModule);
      for (const issue of loadOrderIssues) {
        const localizedIssue = Utils.renderModuleIssue(issue);
        invalidResults.push({
          id: issue.target.id,
          reason: localizedIssue,
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

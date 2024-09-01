import { ComponentType } from 'react';
import { selectors, types } from 'vortex-api';
import { IInvalidResult, IValidationResult } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { BannerlordModuleManager, Utils, types as vetypes } from '@butr/vortexextensionnative';
import { libraryToPersistence, vortexToLibrary } from './converters';
import { actionsLoadOrder } from './actions';
import { orderCurrentLoadOrderByExternalLoadOrder } from './utils';
import { IFBLOItemRendererProps } from './types';
import {
  IModAnalyzerRequestModule,
  IModAnalyzerRequestQuery,
  IModuleCompatibilityInfoCache,
  ModAnalyzerProxy,
} from '../butr';
import { GAME_ID } from '../common';
import { LoadOrderInfoPanel, LoadOrderItemRenderer } from '../views';
import { VortexLoadOrderStorage } from '../types';
import { versionToString, VortexLauncherManager } from '../launcher';

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
    item: IFBLOItemRendererProps;
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

  public serializeLoadOrder = (newLO: VortexLoadOrderStorage, prevLO: VortexLoadOrderStorage): Promise<void> => {
    const loadOrderConverted = vortexToLibrary(newLO);
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

  public deserializeLoadOrder = async (): Promise<VortexLoadOrderStorage> => {
    const launcherManager = VortexLauncherManager.getInstance(this.api);

    // Make sure the LauncherManager has the latest module list
    launcherManager.refreshModules();
    this.allModules = launcherManager.getAllModulesWithDuplicates();

    // Get the saved Load Order
    const allModules = launcherManager.getAllModules();
    const savedLoadOrder = launcherManager.loadLoadOrderVortex();
    const savedLoadOrderPersistence = libraryToPersistence(savedLoadOrder);

    const loadOrder = await orderCurrentLoadOrderByExternalLoadOrder(this.api, allModules, savedLoadOrderPersistence);
    this.setParameters(vortexToLibrary(loadOrder));
    return loadOrder;
  };

  public validate = (prevLO: VortexLoadOrderStorage, newLO: VortexLoadOrderStorage): Promise<IValidationResult> => {
    const modules = (newLO ?? []).flatMap<vetypes.ModuleInfoExtendedWithMetadata>((entry) =>
      entry.data && entry.enabled ? entry.data.moduleInfoExtended : []
    );
    //const validationManager = ValidationManager.fromVortex(newLO);

    const invalidResults: IInvalidResult[] = [];
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

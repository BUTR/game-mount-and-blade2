import { ComponentType } from "react";
import { selectors, types } from "vortex-api";
import {
  IInvalidResult,
  IValidationResult,
} from "vortex-api/lib/extensions/file_based_loadorder/types/types";
import {
  BannerlordModuleManager,
  Utils,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { libraryToPersistence, vortexToLibrary } from "./converters";
import { actionsLoadOrder } from "./actions";
import { orderCurrentLoadOrderByExternalLoadOrderAsync } from "./utils";
import { IFBLOItemRendererProps } from "./types";
import { readLoadOrderAsync, writeLoadOrderAsync } from "./vortex";
import {
  IModAnalyzerRequestModule,
  IModAnalyzerRequestQuery,
  IModuleCompatibilityInfoCache,
  IModuleObfuscationCacheInfoCache,
  ModAnalyzerProxy,
} from "../butr";
import { GAME_ID } from "../common";
import { LoadOrderInfoPanel, LoadOrderItemRenderer } from "../views";
import { VortexLoadOrderStorage } from "../types";
import { versionToString, VortexLauncherManager } from "../launcher";

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
  private compatibilityScoresCache: IModuleCompatibilityInfoCache = {};
  private obfuscationCache: IModuleObfuscationCacheInfoCache = {};

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
        refreshAsync: this.updateCompatibilityScoresAsync,
      });

    this.customItemRenderer = ({ className = "", item }): JSX.Element => {
      const availableProviders = this.allModules
        .filter((x) => x.id === item.loEntry.id)
        .map<vetypes.ModuleProviderType>((x) => x.moduleProviderType);
      const compatibilityScore = this.compatibilityScoresCache[item.loEntry.id];

      return LoadOrderItemRenderer({
        item: item,
        className: className,
        availableProviders: availableProviders,
        compatibilityInfo: compatibilityScore,
      });
    };
  }

  public updateCompatibilityScoresAsync = async (): Promise<void> => {
    const proxy = new ModAnalyzerProxy();
    const launcherManager = VortexLauncherManager.getInstance(this.api);
    const gameVersion = await launcherManager.getGameVersionVortexAsync();
    const query: IModAnalyzerRequestQuery = {
      gameVersion: gameVersion,
      modules: this.allModules.map<IModAnalyzerRequestModule>((x) => ({
        moduleId: x.id,
        moduleVersion: versionToString(x.version),
      })),
    };
    const result = await proxy.analyzeAsync(this.api, query);
    this.compatibilityScoresCache =
      result.modules.reduce<IModuleCompatibilityInfoCache>((map, curr) => {
        map[curr.moduleId] = {
          score: curr.compatibility,
          recommendedScore: curr.recommendedCompatibility,
          recommendedVersion: curr.recommendedModuleVersion,
        };
        return map;
      }, {});
    this.forceRefresh();
  };

  private forceRefresh = (): void => {
    const profile = selectors.activeProfile(this.api.getState());
    if (!profile) {
      return;
    }
    this.api.store?.dispatch(actionsLoadOrder.setFBForceUpdate(profile.id));
  };

  public serializeLoadOrder = async (
    newLO: VortexLoadOrderStorage,
    _prevLO: VortexLoadOrderStorage,
  ): Promise<void> => {
    const loadOrderConverted = vortexToLibrary(newLO);
    await writeLoadOrderAsync(
      this.api,
      libraryToPersistence(loadOrderConverted),
    );
    await this.setParametersAsync(loadOrderConverted);
  };

  private setParametersAsync = async (
    loadOrder: vetypes.LoadOrder,
  ): Promise<void> => {
    const launcherManager = VortexLauncherManager.getInstance(this.api);
    await launcherManager.setModulesToLaunchAsync(loadOrder);
  };

  private populateMissingAttributes = async (
    loadOrder: VortexLoadOrderStorage,
  ): Promise<void> => {
    const launcherManager = VortexLauncherManager.getInstance(this.api);
    for (const entry of loadOrder) {
      if (entry.data === undefined) {
        continue;
      }

      // TODO: We need to invalidate the cache when the module is updated
      // For now a restart will do
      if (entry.data.hasObfuscatedBinaries === null) {
        if (this.obfuscationCache[entry.id] === undefined) {
          this.obfuscationCache[entry.id] =
            await launcherManager.isObfuscatedAsync(
              entry.data.moduleInfoExtended,
            );
        }
        entry.data.hasObfuscatedBinaries = this.obfuscationCache[entry.id]!;
      }
      // TODO: Handle Steam binaries on Xbox?
      // Potentially leave it as is, because it's a manual installation
    }
  };

  public deserializeLoadOrder = async (): Promise<VortexLoadOrderStorage> => {
    const launcherManager = VortexLauncherManager.getInstance(this.api);

    // Make sure the LauncherManager has the latest module list
    await launcherManager.refreshModulesAsync();
    this.allModules = await launcherManager.getAllModulesWithDuplicatesAsync();

    // Get the saved Load Order
    const allModules = await launcherManager.getAllModulesAsync();
    const savedLoadOrder = await readLoadOrderAsync(this.api);

    const loadOrder = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      this.api,
      allModules,
      savedLoadOrder,
    );
    await this.populateMissingAttributes(loadOrder);
    await this.setParametersAsync(vortexToLibrary(loadOrder));
    return loadOrder;
  };

  public validate = (
    prevLO: VortexLoadOrderStorage,
    newLO: VortexLoadOrderStorage,
  ): Promise<IValidationResult> => {
    const modules = (
      newLO ?? []
    ).flatMap<vetypes.ModuleInfoExtendedWithMetadata>((entry) => {
      return entry.data && entry.enabled ? entry.data.moduleInfoExtended : [];
    });
    //const validationManager = ValidationManager.fromVortex(newLO);

    const invalidResults: IInvalidResult[] = [];
    for (const enabledModule of modules) {
      const loadOrderIssues = BannerlordModuleManager.validateLoadOrder(
        modules,
        enabledModule,
      );
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
      invalidResults.length === 0 ? undefined! : { invalid: invalidResults },
    );
  };
}

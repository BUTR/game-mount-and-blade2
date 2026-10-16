import { actions, selectors, types } from "@nexusmods/vortex-api";
import { Utils, types as vetypes } from "@butr/vortexextensionnative";
import {
  libraryToVortex,
  libraryVMToVortex,
  persistenceToLibrary,
  vortexToPersistence,
} from "./converters";
import {
  IModuleCache,
  IPersistenceLoadOrderEntry,
  IStateWithBannerlord,
  PersistenceLoadOrderStorage,
  RequiredProperties,
  VortexLoadOrderEntry,
  VortexLoadOrderStorage,
} from "../types";
import { VortexLauncherManager } from "../launcher/manager";
import { LocalizationManager } from "../localization/manager";
import { bselectors } from "../selectors";
import { GameMode } from "../settings/types";

/**
 * Whether the mode lists the module, the rule the LauncherManager orders by: Native is in both modes
 */
export const isModuleOfGameMode = (
  module: vetypes.ModuleInfoExtended,
  gameMode: GameMode,
): boolean =>
  module.id.toLowerCase() === "native" ||
  (gameMode === "multiplayer"
    ? module.isMultiplayerModule
    : module.isSingleplayerModule);

/**
 * Drops the other mode's modules. Entries of modules that aren't installed are kept, their mode isn't known
 */
export const filterLoadOrderByGameMode = (
  loadOrder: VortexLoadOrderStorage,
  gameMode: GameMode,
): VortexLoadOrderStorage =>
  loadOrder.filter(
    (entry) =>
      entry.data?.moduleInfoExtended === undefined ||
      isModuleOfGameMode(entry.data.moduleInfoExtended, gameMode),
  );

const getExcludedLoadOrder = (
  loadOrder: VortexLoadOrderStorage,
  result: vetypes.OrderByLoadOrderResult,
): VortexLoadOrderStorage => {
  const excludedLoadOrder = loadOrder.reduce<VortexLoadOrderStorage>(
    (arr, curr) => {
      if (
        result.orderedModuleViewModels?.find(
          (x) => x.moduleInfoExtended.id === curr.id,
        )
      ) {
        arr.push(curr);
      }
      return arr;
    },
    [],
  );
  return excludedLoadOrder;
};

/**
 * Appends the modules the saved Load Order doesn't list yet as disabled entries.
 * Otherwise a module that was dropped from the saved Load Order (e.g. while it was being updated)
 * or a freshly installed one would never show up
 */
const appendMissingModules = (
  api: types.IExtensionApi,
  loadOrder: VortexLoadOrderStorage,
  moduleViewModels: vetypes.ModuleViewModel[] | undefined,
): VortexLoadOrderStorage => {
  const knownIds = new Set(loadOrder.map((x) => x.id));
  const missingModules = libraryVMToVortex(
    api,
    (moduleViewModels ?? []).filter(
      (x) => !knownIds.has(x.moduleInfoExtended.id),
    ),
  ).map<VortexLoadOrderEntry>((entry, index) => ({
    ...entry,
    enabled: false,
    data: { ...entry.data!, index: loadOrder.length + index },
  }));
  return [...loadOrder, ...missingModules];
};

const warnSortIssues = (
  api: types.IExtensionApi,
  autoSort: boolean,
  issues: string[],
): void => {
  if (!autoSort || issues.length === 0) {
    return;
  }
  const { localize: t } = LocalizationManager.getInstance(api);
  api.sendNotification?.({
    type: "warning",
    message: t(
      `{=pZVVdI5d}The Load Order was re-sorted with the default algorithm!{NL}Reasons:{NL}{REASONS}`,
      {
        NL: "\n",
        REASONS: issues.join(`\n`),
      },
    ),
  });
};

const checkOrderByLoadOrderResult = (
  api: types.IExtensionApi,
  autoSort: boolean,
  result: vetypes.OrderByLoadOrderResult,
): void => {
  if (result.issues) {
    warnSortIssues(api, autoSort, result.issues);
  }
};

const checkResult = (
  api: types.IExtensionApi,
  autoSort: boolean,
  result: vetypes.OrderByLoadOrderResult,
): result is RequiredProperties<
  vetypes.OrderByLoadOrderResult,
  "orderedModuleViewModels"
> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  if (
    result === undefined ||
    !result.orderedModuleViewModels ||
    result.result === undefined ||
    !result.result
  ) {
    if (autoSort) {
      // The user is not expecting a sort operation, so don't give the notification
      // The issues say why, without them the error can't be acted on or reported usefully
      const issues = result?.issues ?? [];
      api.sendNotification?.({
        type: "error",
        message: [
          t(`{=sLf3eIpH}Failed to order the module list!`),
          ...issues,
        ].join("\n"),
      });
    }
    return false;
  }
  return true;
};

const checkSavedLoadOrder = (
  api: types.IExtensionApi,
  autoSort: boolean,
  loadOrder: VortexLoadOrderStorage,
): void => {
  const savedLoadOrderIssues = Utils.isLoadOrderCorrect(
    loadOrder
      .filter((x) => x.enabled)
      .map<vetypes.ModuleInfoExtendedWithMetadata>(
        (x) => x.data!.moduleInfoExtended,
      ),
  );
  warnSortIssues(api, autoSort, savedLoadOrderIssues);
};

export const orderCurrentLoadOrderByExternalLoadOrderAsync = async (
  api: types.IExtensionApi,
  allModules: IModuleCache,
  savedLoadOrder: PersistenceLoadOrderStorage,
): Promise<VortexLoadOrderStorage> => {
  const state = api.getState<IStateWithBannerlord>();

  const profile = selectors.activeProfile(state);
  if (profile === undefined) {
    return [];
  }

  const autoSort = bselectors.sortOnDeployForProfile(state, profile.id) ?? true;

  const launcherManager = VortexLauncherManager.getInstance(api);

  const savedLoadOrderLibrary = persistenceToLibrary(savedLoadOrder);
  // The other mode's modules are never listed, the LauncherManager drops them from the sorted list too
  const savedLoadOrderVortex = filterLoadOrderByGameMode(
    libraryToVortex(api, allModules, savedLoadOrderLibrary),
    bselectors.activeGameMode(state),
  );

  checkSavedLoadOrder(api, autoSort, savedLoadOrderVortex);

  // Apply the Load Order to the list of modules
  // Useful when there are new modules or old modules are missing
  // The output wil wil contain the auto sorted list of modules
  const result = await launcherManager.orderByLoadOrderAsync(
    savedLoadOrderLibrary,
  );
  if (!checkResult(api, autoSort, result)) {
    // The native side still returns the visible modules when the ordering fails
    return appendMissingModules(
      api,
      savedLoadOrderVortex,
      result?.orderedModuleViewModels,
    );
  }

  // Not even sure this will trigger
  checkOrderByLoadOrderResult(api, autoSort, result);

  // Use the sorted to closest valid state Load Order
  // Also when nothing is saved yet, like a game mode used for the first time, or the list would be empty
  if (autoSort || savedLoadOrderVortex.length === 0) {
    return libraryVMToVortex(api, result.orderedModuleViewModels);
  }

  // Do not use the sorted LO, but take the list of modules. It excludes modules that are not usable
  return appendMissingModules(
    api,
    getExcludedLoadOrder(savedLoadOrderVortex, result),
    result.orderedModuleViewModels,
  );
};

export const toggleLoadOrderAsync = async (
  api: types.IExtensionApi,
  toggle: boolean,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();

  const profile = selectors.activeProfile(state);
  if (!profile) {
    return;
  }

  const currentLoadOrder = bselectors.bannerlordLoadOrder(state, profile.id);
  if (currentLoadOrder.length === 0) {
    return;
  }

  const loadOrder = vortexToPersistence(
    currentLoadOrder,
  ).map<IPersistenceLoadOrderEntry>((entry) => {
    entry.isSelected = toggle;
    return entry;
  });

  const launcherManager = VortexLauncherManager.getInstance(api);
  const allModules = await launcherManager.getAllModulesAsync();
  const orderedLoadOrder = await orderCurrentLoadOrderByExternalLoadOrderAsync(
    api,
    allModules,
    loadOrder,
  );
  api.store?.dispatch(actions.setFBLoadOrder(profile.id, orderedLoadOrder));
};

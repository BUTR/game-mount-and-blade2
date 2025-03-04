import { selectors, types } from 'vortex-api';
import { Utils, types as vetypes } from '@butr/vortexextensionnative';
import { libraryToVortex, libraryVMToVortex, persistenceToLibrary, vortexToPersistence } from './converters';
import { actionsLoadOrder } from './actions';
import { OBFUSCATED_BINARIES, STEAM_BINARIES_ON_XBOX, SUB_MODS_IDS } from '../common';
import {
  IModuleCache,
  IPersistenceLoadOrderEntry,
  PersistenceLoadOrderStorage,
  RequiredProperties,
  VortexLoadOrderStorage,
} from '../types';
import { VortexLauncherManager } from '../launcher';
import { LocalizationManager } from '../localization';
import { hasPersistentLoadOrder } from '../vortex';
import { getSortOnDeployFromSettings } from '../settings';

type ModIdResult = {
  id: string;
  source: string;
  hasSteamBinariesOnXbox: boolean;
  hasObfuscatedBinaries: boolean;
};

/**
 * I have no idea what to do if we have multiple mods that provide the same Module
 */
export const getModuleAttributes = (api: types.IExtensionApi, moduleId: string): ModIdResult[] => {
  const state = api.getState();
  const gameId: string | undefined = selectors.activeGameId(state);
  const gameMods = state.persistent.mods[gameId] ?? {};
  const modIds = Object.values(gameMods).reduce<ModIdResult[]>((arr, mod) => {
    if (!mod.attributes || mod.attributes[SUB_MODS_IDS] === undefined) {
      return arr;
    }
    const subModsIds: Set<string> = new Set(mod.attributes[SUB_MODS_IDS]);
    if (subModsIds.has(moduleId)) {
      arr.push({
        id: mod.attributes['modId'],
        source: mod.attributes['source'],
        hasSteamBinariesOnXbox: mod.attributes[STEAM_BINARIES_ON_XBOX] ?? false,
        hasObfuscatedBinaries: mod.attributes[OBFUSCATED_BINARIES] ?? false,
      });
    }

    return arr;
  }, []);

  return modIds;
};

const getExcludedLoadOrder = (
  loadOrder: VortexLoadOrderStorage,
  result: vetypes.OrderByLoadOrderResult
): VortexLoadOrderStorage => {
  const excludedLoadOrder = loadOrder.reduce<VortexLoadOrderStorage>((arr, curr) => {
    if (result.orderedModuleViewModels?.find((x) => x.moduleInfoExtended.id === curr.id)) {
      arr.push(curr);
    }
    return arr;
  }, []);
  return excludedLoadOrder;
};

const checkOrderByLoadOrderResult = (
  api: types.IExtensionApi,
  autoSort: boolean,
  result: vetypes.OrderByLoadOrderResult
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  if (autoSort && result.issues) {
    api.sendNotification?.({
      type: 'warning',
      message: t(`{=pZVVdI5d}The Load Order was re-sorted with the default algorithm!{NL}Reasons:{NL}{REASONS}`, {
        NL: '\n',
        REASONS: result.issues.join(`\n`),
      }),
    });
  }
};

const checkResult = (
  api: types.IExtensionApi,
  autoSort: boolean,
  result: vetypes.OrderByLoadOrderResult
): result is RequiredProperties<vetypes.OrderByLoadOrderResult, 'orderedModuleViewModels'> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  if (result === undefined || !result.orderedModuleViewModels || result.result === undefined || !result.result) {
    if (autoSort) {
      // The user is not expecting a sort operation, so don't give the notification
      api.sendNotification?.({
        type: 'error',
        message: t(`{=sLf3eIpH}Failed to order the module list!`),
      });
    }
    return false;
  }
  return true;
};

const checkSavedLoadOrder = (api: types.IExtensionApi, autoSort: boolean, loadOrder: VortexLoadOrderStorage): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const savedLoadOrderIssues = Utils.isLoadOrderCorrect(
    loadOrder.filter((x) => x.enabled).map<vetypes.ModuleInfoExtendedWithMetadata>((x) => x.data!.moduleInfoExtended)
  );
  if (autoSort && savedLoadOrderIssues.length > 0) {
    // If there were any issues with the saved LO, the orderer will sort the LO to the nearest working state
    api.sendNotification?.({
      type: 'warning',
      message: t(`{=pZVVdI5d}The Load Order was re-sorted with the default algorithm!{NL}Reasons:{NL}{REASONS}`, {
        NL: '\n',
        REASONS: savedLoadOrderIssues.join(`\n`),
      }),
    });
  }
};

export const orderCurrentLoadOrderByExternalLoadOrderAsync = async (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  savedLoadOrder: PersistenceLoadOrderStorage
): Promise<VortexLoadOrderStorage> => {
  const state = api.getState();

  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  if (profile === undefined) {
    return [];
  }

  const autoSort = getSortOnDeployFromSettings(state, profile.id) ?? true;

  const launcherManager = VortexLauncherManager.getInstance(api);

  const savedLoadOrderLibrary = persistenceToLibrary(savedLoadOrder);
  const savedLoadOrderVortex = libraryToVortex(api, allModules, savedLoadOrderLibrary);

  checkSavedLoadOrder(api, autoSort, savedLoadOrderVortex);

  // Apply the Load Order to the list of modules
  // Useful when there are new modules or old modules are missing
  // The output wil wil contain the auto sorted list of modules
  const result = await launcherManager.orderByLoadOrderAsync(savedLoadOrderLibrary);
  if (!checkResult(api, autoSort, result)) {
    return savedLoadOrderVortex;
  }

  // Not even sure this will trigger
  checkOrderByLoadOrderResult(api, autoSort, result);

  // Use the sorted to closest valid state Load Order
  if (autoSort) {
    return libraryVMToVortex(api, result.orderedModuleViewModels);
  }

  // Do not use the sorted LO, but take the list of modules. It excludes modules that are not usable
  return getExcludedLoadOrder(savedLoadOrderVortex, result);
};

export const toggleLoadOrderAsync = async (api: types.IExtensionApi, toggle: boolean): Promise<void> => {
  const state = api.getState();

  if (!hasPersistentLoadOrder(state.persistent)) {
    return;
  }

  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  if (profile === undefined) {
    return;
  }

  const currentLoadOrder = state.persistent.loadOrder[profile.id];
  if (currentLoadOrder === undefined) {
    return;
  }

  const loadOrder = vortexToPersistence(currentLoadOrder).map<IPersistenceLoadOrderEntry>((entry) => {
    entry.isSelected = toggle;
    return entry;
  });

  const launcherManager = VortexLauncherManager.getInstance(api);
  const allModules = await launcherManager.getAllModulesAsync();
  const orderedLoadOrder = await orderCurrentLoadOrderByExternalLoadOrderAsync(api, allModules, loadOrder);
  api.store?.dispatch(actionsLoadOrder.setFBLoadOrder(profile.id, orderedLoadOrder));
};

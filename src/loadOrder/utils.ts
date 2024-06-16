import { selectors, types } from 'vortex-api';
import { Utils, types as vetypes } from '@butr/vortexextensionnative';
import { libraryToVortex, libraryVMToVortex, persistenceToLibrary } from './converters';
import { SUB_MODS_IDS } from '../common';
import { IModuleCache, PersistenceLoadOrderStorage, RequiredProperties, VortexLoadOrderStorage } from '../types';
import { VortexLauncherManager } from '../launcher';
import { LocalizationManager } from '../localization';

type ModIdResult = {
  id: string;
  source: string;
};

/**
 * I have no idea what to do if we have multiple mods that provide the same Module
 */
export const getModIds = (api: types.IExtensionApi, moduleId: string): ModIdResult[] => {
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
      });
    }

    return arr;
  }, []);

  return modIds;
};

const getExcludedLoadOrder = (
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
    loadOrder.map<vetypes.ModuleInfoExtendedWithMetadata>((x) => x.data!.moduleInfoExtended)
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

export const orderCurrentLoadOrderByExternalLoadOrder = (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  persistenceLoadOrder: PersistenceLoadOrderStorage
): Promise<VortexLoadOrderStorage> => {
  const autoSort = true; // TODO: get from settings
  const launcherManager = VortexLauncherManager.getInstance(api);

  const savedLoadOrder = persistenceToLibrary(persistenceLoadOrder);
  const salecLoadOrderVortex = libraryToVortex(api, allModules, savedLoadOrder);

  checkSavedLoadOrder(api, autoSort, salecLoadOrderVortex);

  // Apply the Load Order to the list of modules
  // Useful when there are new modules or old modules are missing
  // The output wil wil contain the auto sorted list of modules
  const result = launcherManager.orderByLoadOrder(savedLoadOrder);
  if (!checkResult(api, autoSort, result)) {
    return Promise.resolve(salecLoadOrderVortex);
  }

  // Not even sure this will trigger
  checkOrderByLoadOrderResult(api, autoSort, result);

  // Use the sorted to closest valid state Load Order
  if (autoSort) {
    return Promise.resolve(libraryVMToVortex(api, result.orderedModuleViewModels));
  }

  // Do not use the sorted LO, but take the list of modules. It excludes modules that are not usable
  return Promise.resolve(libraryToVortex(api, allModules, getExcludedLoadOrder(savedLoadOrder, result)));
};

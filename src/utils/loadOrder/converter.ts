import { types } from "vortex-api";
import { types as vetypes, BannerlordModuleManager } from "@butr/vortexextensionnative";
import { ValidationManager, getModIds } from "../";
import { VortexLoadOrderStorage, VortexLoadOrderEntry, PersistenceLoadOrderStorage, IModuleCache, PersistenceLoadOrderEntry } from "../../types";

export const persistenceToVortex = (api: types.IExtensionApi, modules: Readonly<IModuleCache>, loadOrder: PersistenceLoadOrderStorage): VortexLoadOrderStorage => {
  const loadOrderConverted = loadOrder.map<VortexLoadOrderEntry>(x => {
    const modIds = getModIds(api, x.id);
    return {
      id: x.id,
      name: x.name,
      enabled: x.isSelected,
      modId: modIds[0]?.id ?? undefined!,
      data: {
        moduleInfoExtended: modules[x.id]!,
        index: x.index,
      },
    };
  }).sort((x, y) => x.data!.index - y.data!.index);
  return loadOrderConverted;
};

export const libraryToPersistence = (loadOrder: vetypes.LoadOrder): PersistenceLoadOrderStorage => {
  const loadOrderConverted = Object.values(loadOrder).map<PersistenceLoadOrderEntry>(x => ({
    id: x.id,
    name: x.name,
    isSelected: x.isSelected,
    isDisabled: x.isDisabled,
    index: x.index,
  }));
  return loadOrderConverted;
};

export const vortexToLibraryVM = (loadOrder: VortexLoadOrderStorage): vetypes.ModuleViewModel[] => {
  const modules = loadOrder.flatMap<vetypes.ModuleInfoExtendedWithPath>((entry) => entry.data ? entry.data.moduleInfoExtended : []);
  const validationManager = ValidationManager.fromVortex(loadOrder);

  const loadOrderConverted = loadOrder.flatMap<vetypes.ModuleViewModel>((entry) => entry.data ? {
    moduleInfoExtended: entry.data.moduleInfoExtended,
    isValid: entry.enabled && BannerlordModuleManager.validateModule(modules, entry.data.moduleInfoExtended, validationManager).length == 0,
    isSelected: entry.enabled,
    isDisabled: !!entry.locked && (entry.locked === `true` || entry.locked === `always`),
    index: entry.data.index,
  } : []);
  return loadOrderConverted;
};
export const libraryVMToVortex = (api: types.IExtensionApi, loadOrder: vetypes.ModuleViewModel[]): types.LoadOrder => {
  const loadOrderConverted = Object.values(loadOrder).map<VortexLoadOrderEntry>((curr) => {
    const modId = getModIds(api, curr.moduleInfoExtended.id);
    return {
      id: curr.moduleInfoExtended.id,
      enabled: curr.isSelected,
      name: curr.moduleInfoExtended.name,
      modId: modId[0]?.id ?? undefined!,
      data: {
        moduleInfoExtended: curr.moduleInfoExtended,
        isValid: curr.isValid,
        isDisabled: curr.isDisabled,
        index: curr.index,
      },
    };
  }, []);
  return loadOrderConverted;
};
export const libraryVMToLibrary = (loadOrder: vetypes.ModuleViewModel[]): vetypes.LoadOrder => {
  const loadOrderConverted = loadOrder.reduce<vetypes.LoadOrder>((map, curr) => {
    map[curr.moduleInfoExtended.id] = {
      id: curr.moduleInfoExtended.id,
      name: curr.moduleInfoExtended.name,
      isSelected: curr.isSelected,
      isDisabled: curr.isDisabled,
      index: curr.index,
    };
    return map;
  }, {});
  return loadOrderConverted;
};

export const vortexToLibrary = (loadOrder: VortexLoadOrderStorage): vetypes.LoadOrder => {
  const loadOrderConverted = loadOrder.reduce<vetypes.LoadOrder>((map, curr) => {
    map[curr.id] = {
      id: curr.id,
      name: curr.name,
      isSelected: curr.enabled,
      isDisabled: !!curr.locked && (curr.locked === `true` || curr.locked === `always`),
      index: loadOrder.indexOf(curr),
    };
    return map;
  }, {});
  return loadOrderConverted;
};
export const libraryToVortex = (api: types.IExtensionApi, allModules: Readonly<IModuleCache>, loadOrder: vetypes.LoadOrder): VortexLoadOrderStorage => {
  const availableModules = Object.values(loadOrder).map<vetypes.ModuleInfoExtendedWithPath>((curr) => allModules[curr.id]!);
  const validationManager = ValidationManager.fromLibrary(loadOrder);

  const loadOrderConverted = Object.values(loadOrder).map<VortexLoadOrderEntry>((curr) => {
    const module = allModules[curr.id]!;
    const moduleValidation = BannerlordModuleManager.validateModule(availableModules, module, validationManager);
    const modId = getModIds(api, curr.id);
    return {
      id: curr.id,
      enabled: curr.isSelected,
      name: curr.name,
      modId: modId[0]?.id ?? undefined!,
      data: {
        moduleInfoExtended: module,
        isValid: moduleValidation && moduleValidation.length === 0,
        isDisabled: false,
        index: curr.index,
      },
    };
  }, []);
  return loadOrderConverted;
};
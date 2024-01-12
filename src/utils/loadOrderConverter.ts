import { types } from "vortex-api";
import { types as vetypes, BannerlordModuleManager } from "@butr/vortexextensionnative";
import { VortexLauncherManager, ValidationManager } from ".";
import { VortexLoadOrderStorage, VortexLoadOrderEntry, PersistenceLoadOrderStorage, IModuleCache, PersistenceLoadOrderEntry } from "../types";

export const persistenceToVortex = (modules: Readonly<IModuleCache>, loadOrder: PersistenceLoadOrderStorage): VortexLoadOrderStorage => {
  const loadOrderConverted = loadOrder.map<VortexLoadOrderEntry>(x => {
    return {
      id: x.id,
      name: x.name,
      enabled: x.isSelected,
      locked: undefined,
      modId: x.id,
      data: {
        moduleInfoExtended: modules[x.id],
        isDisabled: x.isDisabled,
        index: x.index,
      },
    } as VortexLoadOrderEntry
  });
  return loadOrderConverted;
}
export const libraryToPersistence = (loadOrder: vetypes.LoadOrder): PersistenceLoadOrderStorage => {
  const loadOrderConverted = Object.values(loadOrder).map(x => {
    return {
      id: x.id,
      name: x.name,
      isSelected: x.isSelected,
      isDisabled: x.isDisabled,
      index: x.index,
    } as PersistenceLoadOrderEntry;
  });
  return loadOrderConverted;
}


export const vortexToLibraryVM = (loadOrder: VortexLoadOrderStorage): vetypes.ModuleViewModel[] => {
  const modules = loadOrder.flatMap((entry) => entry.data ? entry.data.moduleInfoExtended : []);
  const validationManager = ValidationManager.fromVortex(loadOrder);

  const loadOrderConverted = loadOrder.flatMap((entry) => entry.data ? {
    moduleInfoExtended: entry.data.moduleInfoExtended,
    isValid: entry.enabled && BannerlordModuleManager.validateModule(modules, entry.data.moduleInfoExtended, validationManager).length == 0,
    isSelected: entry.enabled,
    isDisabled: entry.data.isDisabled,
    index: entry.data.index,
  } as vetypes.ModuleViewModel : []);
  return loadOrderConverted;
}

export const vortexToLibrary = (loadOrder: VortexLoadOrderStorage): vetypes.LoadOrder => {
  const loadOrderConverted = loadOrder.reduce<vetypes.LoadOrder>((map, current) => {
    map[current.id] = {
      id: current.id,
      name: current.name,
      isSelected: current.enabled,
      isDisabled: !(!current.locked || current.locked === `false` || current.locked === `never`),
      index: loadOrder.indexOf(current),
    };
    return map;
  }, { });
  return loadOrderConverted;
}

export const libraryToVortex = (manager: VortexLauncherManager, loadOrder: vetypes.LoadOrder): VortexLoadOrderStorage => {
  const modules = manager.getAvailableModules();
  const validationManager = ValidationManager.fromLibrary(loadOrder);

  const loadOrderConverted = Object.values(loadOrder).map((current, idx) => {
    const module = modules[current.id];
    const moduleValidation = BannerlordModuleManager.validateModule(Object.values(modules), module, validationManager);
    return {
      id: current.id,
      enabled: current.isSelected,
      name: current.name,
      modId: current.id,
      data: {
        moduleInfoExtended: module,
        //isValid: true,
        isValid: moduleValidation && moduleValidation.length === 0,
        isDisabled: false,
        index: current.index,
      },
    } as VortexLoadOrderEntry;
  }, [] as VortexLoadOrderStorage);
  return loadOrderConverted;
}

export const libraryVMToVortex = (loadOrder: vetypes.ModuleViewModel[]): types.LoadOrder => {
  const loadOrderConverted = Object.values(loadOrder).map((current, idx) => {
    return {
      id: current.moduleInfoExtended.id,
      enabled: current.isSelected,
      name: current.moduleInfoExtended.name,
      modId: current.moduleInfoExtended.id,
      data: {
        moduleInfoExtended: current.moduleInfoExtended,
        isValid: current.isValid,
        isDisabled: current.isDisabled,
        index: current.index,
      },
    } as VortexLoadOrderEntry;
  }, [] as VortexLoadOrderStorage);
  return loadOrderConverted;
}
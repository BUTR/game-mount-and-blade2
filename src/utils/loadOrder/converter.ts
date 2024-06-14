import { types } from 'vortex-api';
import { BannerlordModuleManager, types as vetypes } from '@butr/vortexextensionnative';
import {
  IModuleCache,
  IPersistenceLoadOrderEntry,
  PersistenceLoadOrderStorage,
  VortexLoadOrderEntry,
  VortexLoadOrderStorage,
} from '../../types';
import { ValidationManager } from '../validationManager';
import { getModIds } from '../moduleUtil';

export const persistenceToVortex = (
  api: types.IExtensionApi,
  modules: Readonly<IModuleCache>,
  loadOrder: PersistenceLoadOrderStorage
): VortexLoadOrderStorage => {
  const loadOrderConverted = loadOrder
    .map<VortexLoadOrderEntry>((x) => {
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
    })
    .filter((x) => x.data !== undefined)
    .sort((x, y) => x.data!.index - y.data!.index);
  return loadOrderConverted;
};

export const vortexToPersistence = (loadOrder: VortexLoadOrderStorage): PersistenceLoadOrderStorage => {
  const loadOrderConverted = Object.values(loadOrder).map<IPersistenceLoadOrderEntry>((x, index) => ({
    id: x.id,
    name: x.name,
    isSelected: x.enabled,
    isDisabled: !!x.locked && (x.locked === `true` || x.locked === `always`),
    index: index,
  }));
  return loadOrderConverted;
};

export const libraryToPersistence = (loadOrder: vetypes.LoadOrder): PersistenceLoadOrderStorage => {
  const loadOrderConverted = Object.values(loadOrder).map<IPersistenceLoadOrderEntry>((x) => ({
    id: x.id,
    name: x.name,
    isSelected: x.isSelected,
    isDisabled: x.isDisabled,
    index: x.index,
  }));
  return loadOrderConverted;
};

export const vortexToLibraryVM = (
  loadOrder: VortexLoadOrderStorage,
  allModules: Readonly<IModuleCache>
): vetypes.ModuleViewModel[] => {
  const modules = loadOrder
    .map<vetypes.ModuleInfoExtendedWithMetadata>((entry) => allModules[entry.id]!)
    .filter((x) => x !== undefined);
  const validationManager = ValidationManager.fromVortex(loadOrder);

  const loadOrderConverted = loadOrder.flatMap<vetypes.ModuleViewModel>((entry) => {
    const module = allModules[entry.id];
    return entry.data && module
      ? {
          moduleInfoExtended: module,
          isValid:
            entry.enabled && BannerlordModuleManager.validateModule(modules, module, validationManager).length === 0,
          isSelected: entry.enabled,
          isDisabled: !!entry.locked && (entry.locked === `true` || entry.locked === `always`),
          index: entry.data.index,
        }
      : [];
  });
  return loadOrderConverted;
};
export const libraryVMToVortex = (
  api: types.IExtensionApi,
  loadOrder: vetypes.ModuleViewModel[]
): VortexLoadOrderStorage => {
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
export const libraryToLibraryVM = (modules: vetypes.ModuleInfoExtendedWithMetadata[]): vetypes.ModuleViewModel[] => {
  //const validationManager = ValidationManager.fromLibrary(loadOrder);
  const loadOrderConverted = modules.reduce<vetypes.ModuleViewModel[]>((arr, curr) => {
    arr.push({
      moduleInfoExtended: curr,
      //isValid: BannerlordModuleManager.validateModule(modules, curr, validationManager).length === 0,
      isValid: false,
      isSelected: false,
      isDisabled: false,
      index: 0,
    });
    return arr;
  }, []);
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
export const libraryToVortex = (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  loadOrder: vetypes.LoadOrder
): VortexLoadOrderStorage => {
  const availableModules = Object.values(loadOrder)
    .map<vetypes.ModuleInfoExtendedWithMetadata>((curr) => allModules[curr.id]!)
    .filter((x) => x !== undefined);
  const validationManager = ValidationManager.fromLibrary(loadOrder);

  const loadOrderConverted = Object.values(loadOrder)
    .map<VortexLoadOrderEntry>((curr) => {
      const module = allModules[curr.id];
      if (module === undefined) {
        return undefined!;
      }

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
    }, [])
    .filter((x) => x !== undefined);
  return loadOrderConverted;
};

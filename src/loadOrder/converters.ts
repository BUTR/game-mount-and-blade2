import { types } from "vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { getModuleAttributes } from "./utils";
import {
  IModuleCache,
  IPersistenceLoadOrderEntry,
  PersistenceLoadOrderStorage,
  VortexLoadOrderEntry,
  VortexLoadOrderStorage,
} from "../types";
import { ValidationManager } from "../validation";

export const persistenceToVortex = (
  api: types.IExtensionApi,
  modules: Readonly<IModuleCache>,
  loadOrder: PersistenceLoadOrderStorage,
): VortexLoadOrderStorage => {
  const loadOrderConverted = loadOrder
    .map<VortexLoadOrderEntry>((x) => {
      const result = getModuleAttributes(api, x.id);
      return {
        id: x.id,
        name: x.name,
        enabled: x.isSelected,
        ...(result[0]?.id !== undefined && { modId: result[0].id }),
        data: {
          moduleInfoExtended: modules[x.id]!,
          index: x.index,
          hasSteamBinariesOnXbox: result[0]?.hasSteamBinariesOnXbox ?? null,
          hasObfuscatedBinaries: result[0]?.hasObfuscatedBinaries ?? null,
        },
      };
    })
    .filter((x) => x.data)
    .sort((x, y) => x.data!.index - y.data!.index);
  return loadOrderConverted;
};

export const persistenceToLibrary = (
  loadOrder: PersistenceLoadOrderStorage,
): vetypes.LoadOrder => {
  const loadOrderConverted = loadOrder.reduce<vetypes.LoadOrder>(
    (map, curr) => {
      map[curr.id] = {
        id: curr.id,
        name: curr.name,
        isSelected: curr.isSelected,
        isDisabled: curr.isDisabled,
        index: curr.index,
      };
      return map;
    },
    {},
  );
  return loadOrderConverted;
};

export const vortexToPersistence = (
  loadOrder: VortexLoadOrderStorage,
): PersistenceLoadOrderStorage => {
  const loadOrderConverted = Object.values(
    loadOrder,
  ).map<IPersistenceLoadOrderEntry>((x, index) => ({
    id: x.id,
    name: x.name,
    isSelected: x.enabled,
    isDisabled:
      x.locked !== undefined && (x.locked === `true` || x.locked === `always`),
    index: index,
  }));
  return loadOrderConverted;
};

export const libraryToPersistence = (
  loadOrder: vetypes.LoadOrder,
): PersistenceLoadOrderStorage => {
  const loadOrderConverted = Object.values(
    loadOrder,
  ).map<IPersistenceLoadOrderEntry>((x) => ({
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
  allModules: Readonly<IModuleCache>,
): vetypes.ModuleViewModel[] => {
  const modules = loadOrder
    .map<vetypes.ModuleInfoExtendedWithMetadata>(
      (entry) => allModules[entry.id]!,
    )
    .filter((x) => x);
  const validationManager = ValidationManager.fromVortex(loadOrder);

  const loadOrderConverted = loadOrder.flatMap<vetypes.ModuleViewModel>(
    (entry) => {
      const module = allModules[entry.id];
      return entry.data && module
        ? {
            moduleInfoExtended: module,
            isValid:
              entry.enabled &&
              !BannerlordModuleManager.validateModule(
                modules,
                module,
                validationManager,
              ).length,
            isSelected: entry.enabled,
            isDisabled:
              entry.locked !== undefined &&
              (entry.locked === `true` || entry.locked === `always`),
            index: entry.data.index,
          }
        : [];
    },
  );
  return loadOrderConverted;
};
export const libraryVMToVortex = (
  api: types.IExtensionApi,
  loadOrder: vetypes.ModuleViewModel[],
): VortexLoadOrderStorage => {
  const loadOrderConverted = Object.values(loadOrder).map<VortexLoadOrderEntry>(
    (curr) => {
      const result = getModuleAttributes(api, curr.moduleInfoExtended.id);
      return {
        id: curr.moduleInfoExtended.id,
        enabled: curr.isSelected,
        name: curr.moduleInfoExtended.name,
        ...(result[0]?.id !== undefined && { modId: result[0].id }),
        data: {
          moduleInfoExtended: curr.moduleInfoExtended,
          isValid: curr.isValid,
          isDisabled: curr.isDisabled,
          index: curr.index,
          hasSteamBinariesOnXbox: result[0]?.hasSteamBinariesOnXbox ?? null,
          hasObfuscatedBinaries: result[0]?.hasObfuscatedBinaries ?? null,
        },
      };
    },
    Array<VortexLoadOrderEntry>(),
  );
  return loadOrderConverted;
};
export const libraryVMToLibrary = (
  loadOrder: vetypes.ModuleViewModel[],
): vetypes.LoadOrder => {
  const loadOrderConverted = loadOrder.reduce<vetypes.LoadOrder>(
    (map, curr) => {
      map[curr.moduleInfoExtended.id] = {
        id: curr.moduleInfoExtended.id,
        name: curr.moduleInfoExtended.name,
        isSelected: curr.isSelected,
        isDisabled: curr.isDisabled,
        index: curr.index,
      };
      return map;
    },
    {},
  );
  return loadOrderConverted;
};
export const libraryToLibraryVM = (
  modules: vetypes.ModuleInfoExtendedWithMetadata[],
): vetypes.ModuleViewModel[] => {
  //const validationManager = ValidationManager.fromLibrary(loadOrder);
  const loadOrderConverted = modules.reduce<vetypes.ModuleViewModel[]>(
    (arr, curr) => {
      arr.push({
        moduleInfoExtended: curr,
        //isValid: BannerlordModuleManager.validateModule(modules, curr, validationManager).length === 0,
        isValid: false,
        isSelected: false,
        isDisabled: false,
        index: 0,
      });
      return arr;
    },
    [],
  );
  return loadOrderConverted;
};

export const vortexToLibrary = (
  loadOrder: VortexLoadOrderStorage,
): vetypes.LoadOrder => {
  const loadOrderConverted = loadOrder.reduce<vetypes.LoadOrder>(
    (map, curr) => {
      map[curr.id] = {
        id: curr.id,
        name: curr.name,
        isSelected: curr.enabled,
        isDisabled:
          curr.locked !== undefined &&
          (curr.locked === `true` || curr.locked === `always`),
        index: loadOrder.indexOf(curr),
      };
      return map;
    },
    {},
  );
  return loadOrderConverted;
};
export const libraryToVortex = (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  loadOrder: vetypes.LoadOrder,
): VortexLoadOrderStorage => {
  const availableModules = Object.values(loadOrder)
    .map<vetypes.ModuleInfoExtendedWithMetadata>((curr) => allModules[curr.id]!)
    .filter((x) => x);
  const validationManager = ValidationManager.fromLibrary(loadOrder);

  const loadOrderConverted = Object.values(loadOrder)
    .map<VortexLoadOrderEntry | undefined>((curr) => {
      const module = allModules[curr.id];
      if (!module) {
        return undefined;
      }

      const moduleValidation = BannerlordModuleManager.validateModule(
        availableModules,
        module,
        validationManager,
      );
      const result = getModuleAttributes(api, curr.id);
      return {
        id: curr.id,
        enabled: curr.isSelected,
        name: curr.name,
        ...(result[0]?.id !== undefined && { modId: result[0].id }),
        data: {
          moduleInfoExtended: module,
          isValid: !moduleValidation.length,
          isDisabled: false,
          index: curr.index,
          hasSteamBinariesOnXbox: result[0]?.hasSteamBinariesOnXbox ?? null,
          hasObfuscatedBinaries: result[0]?.hasObfuscatedBinaries ?? null,
        },
      };
    }, [])
    .filter<VortexLoadOrderEntry>((x) => !!x);
  return loadOrderConverted;
};

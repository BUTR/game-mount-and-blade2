import { types } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { getModuleAttributes } from "../vortex/modFinder";
import {
  IModuleCache,
  IPersistenceLoadOrderEntry,
  PersistenceLoadOrderStorage,
  VortexLoadOrderEntry,
  VortexLoadOrderStorage,
} from "../types";
import { ValidationManager } from "../validation/manager";

/**
 * Vortex's LockedState, the boolean and the string forms
 */
export const isLockedEntry = (
  entry: Pick<VortexLoadOrderEntry, "locked">,
): boolean =>
  entry.locked === true || entry.locked === `true` || entry.locked === `always`;

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
    isDisabled: isLockedEntry(x),
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
  allModules: IModuleCache,
): vetypes.ModuleViewModel[] => {
  const modules = loadOrder
    .map<vetypes.ModuleInfoExtendedWithMetadata>(
      (entry) => allModules[entry.id]!,
    )
    .filter((x) => x);
  const validationManager = ValidationManager.fromVortex(loadOrder);

  // The list goes to LauncherManager once for every module's validation
  const validator = BannerlordModuleManager.createValidator(modules);
  try {
    return loadOrder.flatMap<vetypes.ModuleViewModel>((entry) => {
      const module = allModules[entry.id];
      return entry.data && module
        ? {
            moduleInfoExtended: module,
            isValid:
              entry.enabled &&
              !validator.validateModule(module, validationManager).length,
            isSelected: entry.enabled,
            isDisabled: isLockedEntry(entry),
            index: entry.data.index,
          }
        : [];
    });
  } finally {
    validator.dispose();
  }
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
export const libraryToLibraryVM = (
  modules: vetypes.ModuleInfoExtendedWithMetadata[],
): vetypes.ModuleViewModel[] => {
  return modules.map<vetypes.ModuleViewModel>((curr) => ({
    moduleInfoExtended: curr,
    isValid: false,
    isSelected: false,
    isDisabled: false,
    index: 0,
  }));
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
        isDisabled: isLockedEntry(curr),
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
  allModules: IModuleCache,
  loadOrder: vetypes.LoadOrder,
): VortexLoadOrderStorage => {
  const availableModules = Object.values(loadOrder)
    .map<vetypes.ModuleInfoExtendedWithMetadata>((curr) => allModules[curr.id]!)
    .filter((x) => x);
  const validationManager = ValidationManager.fromLibrary(loadOrder);

  // The list goes to LauncherManager once for every module's validation
  const validator = BannerlordModuleManager.createValidator(availableModules);
  try {
    return Object.values(loadOrder)
      .map<VortexLoadOrderEntry | undefined>((curr) => {
        const module = allModules[curr.id];
        if (!module) {
          return undefined;
        }

        const moduleValidation = validator.validateModule(
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
  } finally {
    validator.dispose();
  }
};

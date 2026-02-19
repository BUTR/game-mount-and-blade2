import { actions, selectors, types } from "vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import {
  libraryToLibraryVM,
  libraryVMToVortex,
  vortexToLibraryVM,
} from "../../loadOrder";
import { bselectors } from "../../selectors";
import { filterEntryWithInvalidId } from "../../utils";
import {
  IModuleCache,
  IStateWithBannerlord,
  VortexLoadOrderStorage,
} from "../../types";

/**
 * Gets the LoadOrder from Vortex's Load Order Page
 */
export const getLoadOrderFromVortex = (
  api: types.IExtensionApi,
): VortexLoadOrderStorage => {
  const state = api.getState<IStateWithBannerlord>();

  const profile = selectors.activeProfile(state);
  if (!profile) {
    return [];
  }

  const loadOrder = bselectors.bannerlordLoadOrder(state, profile.id);
  if (!Array.isArray(loadOrder)) {
    return [];
  }
  return loadOrder.filter((x) => x?.data && filterEntryWithInvalidId(x));
};

/**
 * Callback: returns the ViewModels currently displayed by Vortex
 */
export const getModuleViewModelsCallback =
  (
    api: types.IExtensionApi,
    getAllModulesAsync: () => Promise<Readonly<IModuleCache>>,
  ) =>
  async (): Promise<vetypes.ModuleViewModel[] | null> => {
    const allModules = await getAllModulesAsync();
    const loadOrder = getLoadOrderFromVortex(api);
    const viewModels = vortexToLibraryVM(loadOrder, allModules);
    const result = Object.values(viewModels);
    return result;
  };

/**
 * Callback: returns all available ViewModels for possible displaying
 */
export const getAllModuleViewModelsCallback =
  (
    api: types.IExtensionApi,
    getAllModulesAsync: () => Promise<Readonly<IModuleCache>>,
    getModuleViewModelsAsync: () => Promise<vetypes.ModuleViewModel[] | null>,
  ) =>
  async (): Promise<vetypes.ModuleViewModel[] | null> => {
    const allModules = await getAllModulesAsync();
    const existingModuleViewModels = (await getModuleViewModelsAsync()) ?? [];
    const modulesToConvert = Object.values(allModules).filter(
      (x) =>
        !existingModuleViewModels.find((y) => y.moduleInfoExtended.id === x.id),
    );

    const viewModels = libraryToLibraryVM(modulesToConvert);
    const result = viewModels.concat(existingModuleViewModels);
    return result;
  };

/**
 * Callback: updates the Vortex load order from ViewModels
 */
export const setModuleViewModelsCallback =
  (api: types.IExtensionApi) =>
  (moduleViewModels: vetypes.ModuleViewModel[]): Promise<void> => {
    const state = api.getState();

    const profile = selectors.activeProfile(state);
    if (!profile) {
      return Promise.resolve();
    }

    const loadOrder = libraryVMToVortex(api, moduleViewModels);

    api.store?.dispatch(actions.setFBLoadOrder(profile.id, loadOrder));
    return Promise.resolve();
  };

import { actions, log, selectors, types, util } from "vortex-api";
import {
  allocWithoutOwnership,
  types as vetypes,
} from "@butr/vortexextensionnative";
import path from "path";
import { FileHandle, open, readdir, rm, writeFile } from "node:fs/promises";
import {
  libraryToLibraryVM,
  libraryVMToVortex,
  vortexToLibraryVM,
} from "../loadOrder";
import { bselectors } from "../selectors";
import { filterEntryWithInvalidId } from "../utils";
import { GAME_ID } from "../common";
import {
  IModuleCache,
  IStateWithBannerlord,
  VortexLoadOrderStorage,
} from "../types";
import { LocalizationManager } from "../localization";

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
 * Callback: sets game parameters (CLI args) for discovered tools
 */
export const setGameParametersCallback =
  (api: types.IExtensionApi) =>
  (_executable: string, gameParameters: string[]): Promise<void> => {
    const params = gameParameters
      .filter((x) => x !== " " && x.length > 0)
      .join(" ");

    const state = api.getState();
    const discovery = selectors.currentGameDiscovery(state);
    const cliTools = Object.values(discovery?.tools ?? {}).filter(
      (tool) => tool.id && tool.id.endsWith("-cli"),
    );
    const batchedActions = cliTools.map((tool) =>
      actions.addDiscoveredTool(
        GAME_ID,
        tool.id,
        { ...tool, parameters: [params] },
        true,
      ),
    );
    const gameParamAction = actions.setGameParameters(GAME_ID, {
      parameters: [params],
    });
    util.batchDispatch(api.store?.dispatch, [
      ...batchedActions,
      gameParamAction,
    ]);

    return Promise.resolve();
  };

/**
 * Callback: sends a notification to the user
 */
export const sendNotificationCallback =
  (api: types.IExtensionApi) =>
  (
    id: string,
    type: vetypes.NotificationType,
    message: string,
    delayMS: number,
  ): Promise<void> => {
    switch (type) {
      case "hint":
        api.sendNotification?.({
          id: id,
          type: "activity",
          message: message,
          displayMS: delayMS,
        });
        break;
      case "info":
        api.sendNotification?.({
          id: id,
          type: "info",
          message: message,
          displayMS: delayMS,
        });
        break;
      case "warning":
        api.sendNotification?.({
          id: id,
          type: "warning",
          message: message,
          displayMS: delayMS,
        });
        break;
      case "error":
        api.sendNotification?.({
          id: id,
          type: "error",
          message: message,
          displayMS: delayMS,
        });
        break;
    }

    return Promise.resolve();
  };

/**
 * Callback: shows a dialog to the user
 */
export const sendDialogCallback =
  (api: types.IExtensionApi) =>
  async (
    type: vetypes.DialogType,
    title: string,
    message: string,
    filters: vetypes.FileFilter[],
  ): Promise<string> => {
    const { localize: t } = LocalizationManager.getInstance(api);

    switch (type) {
      case "warning": {
        const messageFull = message.split("--CONTENT-SPLIT--", 2).join("\n");
        const no = t("No");
        const yes = t("Yes");
        const result = await api.showDialog?.(
          "question",
          title,
          { message: messageFull },
          [{ label: no }, { label: yes }],
        );
        switch (result?.action) {
          case yes:
            return "true";
          case no:
            return "false";
          default:
            return "";
        }
      }
      case "fileOpen": {
        const filtersTransformed = filters.map<types.IFileFilter>((x) => ({
          name: x.name,
          extensions: x.extensions,
        }));
        const result = await api.selectFile({
          filters: filtersTransformed,
        });
        return result;
      }
      case "fileSave": {
        const fileName = message;
        const filtersTransformed = filters.map<types.IFileFilter>((x) => ({
          name: x.name,
          extensions: x.extensions,
        }));
        const result = await api.saveFile({
          filters: filtersTransformed,
          defaultPath: fileName,
        });
        return result;
      }
    }
  };

/**
 * Callback: returns the game install path
 */
export const getInstallPathCallback =
  (api: types.IExtensionApi) => (): Promise<string> => {
    const state = api.getState();
    const discovery = selectors.currentGameDiscovery(state);
    const installPath = discovery?.path ?? "";
    log("debug", "[BLSE Debug] getInstallPathAsync called", {
      hasDiscovery: discovery !== undefined,
      path: installPath,
      pathType: typeof installPath,
      store: discovery?.store,
    });
    return Promise.resolve(installPath);
  };

/**
 * Callback: reads file content at a given path
 */
export const readFileContentCallback =
  (api: types.IExtensionApi) =>
  async (
    filePath: string,
    offset: number,
    length: number,
  ): Promise<Uint8Array | null> => {
    try {
      let fileHandle: FileHandle | null = null;
      try {
        fileHandle = await open(filePath, "r");
        if (length === -1) {
          const stats = await fileHandle.stat();
          length = stats.size;
        }
        const buffer = allocWithoutOwnership(length) ?? new Uint8Array(length);
        await fileHandle.read(buffer, 0, length, offset);
        return buffer;
      } finally {
        await fileHandle?.close();
      }
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Error reading file content"), err);
    }
    return null;
  };

/**
 * Callback: writes file content or deletes a file
 */
export const writeFileContentCallback =
  (api: types.IExtensionApi) =>
  async (filePath: string, data: Uint8Array): Promise<void> => {
    try {
      if (data === null) {
        await rm(filePath);
      } else {
        await writeFile(filePath, data);
      }
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Error writing file content"), err);
    }
  };

/**
 * Callback: lists files in a directory
 */
export const readDirectoryFileListCallback =
  (api: types.IExtensionApi) =>
  async (directoryPath: string): Promise<string[] | null> => {
    try {
      const dirs = await readdir(directoryPath, { withFileTypes: true });
      const res = dirs
        .filter((x) => x.isFile())
        .map<string>((x) => path.join(directoryPath, x.name));
      return res;
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Error reading directory file list"), err);
    }
    return null;
  };

/**
 * Callback: lists subdirectories in a directory
 */
export const readDirectoryListCallback =
  (api: types.IExtensionApi) =>
  async (directoryPath: string): Promise<string[] | null> => {
    try {
      const dirs = await readdir(directoryPath, { withFileTypes: true });
      const res = dirs
        .filter((x) => x.isDirectory())
        .map<string>((x) => path.join(directoryPath, x.name));
      return res;
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Error reading directory list"), err);
    }
    return null;
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
    const profile = selectors.activeProfile(api.getState());
    if (!profile) {
      return Promise.resolve();
    }

    const loadOrder = libraryVMToVortex(api, moduleViewModels);

    api.store?.dispatch(actions.setFBLoadOrder(profile.id, loadOrder));
    return Promise.resolve();
  };

/**
 * Callback: returns launcher options from Vortex state
 */
export const getOptionsCallback =
  (api: types.IExtensionApi) => (): Promise<vetypes.LauncherOptions> => {
    const state = api.getState<IStateWithBannerlord>();

    const profile = selectors.activeProfile(state);
    if (!profile) {
      return Promise.resolve({
        betaSorting: false,
      });
    }

    const betaSorting =
      bselectors.betaSortingForProfile(state, profile.id) ?? false;

    return Promise.resolve({
      betaSorting: betaSorting,
    });
  };

/**
 * Callback: returns launcher state
 */
export const getStateCallback = (): Promise<vetypes.LauncherState> => {
  return Promise.resolve({
    isSingleplayer: true, // We don't support multiplayer yet
  });
};

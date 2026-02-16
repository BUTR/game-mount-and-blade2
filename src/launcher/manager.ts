import { types } from "vortex-api";
import {
  NativeLauncherManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { vortexStoreToLibraryStore } from "../vortex";
import { installModuleAsync } from "./installer";
import {
  getAllModuleViewModelsCallback,
  getInstallPathCallback,
  getModuleViewModelsCallback,
  getOptionsCallback,
  getStateCallback,
  readDirectoryFileListCallback,
  readDirectoryListCallback,
  readFileContentCallback,
  sendDialogCallback,
  sendNotificationCallback,
  setGameParametersCallback,
  setModuleViewModelsCallback,
  writeFileContentCallback,
} from "./callbacks";
import { GAME_ID } from "../common";
import { IModuleCache } from "../types";

export class VortexLauncherManager {
  private static _instance: VortexLauncherManager | undefined;

  public static getInstance(api: types.IExtensionApi): VortexLauncherManager {
    if (!VortexLauncherManager._instance) {
      VortexLauncherManager._instance = new VortexLauncherManager(api);
    }

    return VortexLauncherManager._instance;
  }

  private launcherManager: NativeLauncherManager;
  private api: types.IExtensionApi;

  public constructor(api: types.IExtensionApi) {
    this.api = api;

    const getModuleViewModelsAsync = getModuleViewModelsCallback(
      api,
      this.getAllModulesAsync,
    );

    this.launcherManager = new NativeLauncherManager(
      setGameParametersCallback(api),
      sendNotificationCallback(api),
      sendDialogCallback(api),
      getInstallPathCallback(api),
      readFileContentCallback(api),
      writeFileContentCallback(api),
      readDirectoryFileListCallback(api),
      readDirectoryListCallback(api),
      getAllModuleViewModelsCallback(
        api,
        this.getAllModulesAsync,
        getModuleViewModelsAsync,
      ),
      getModuleViewModelsAsync,
      setModuleViewModelsCallback(api),
      getOptionsCallback(api),
      getStateCallback,
    );
  }

  /**
   * Will trigger the LauncherManager to pull the @property {moduleViewModels}
   * And update the LO for the CLI.
   */
  public refreshGameParametersAsync = async (): Promise<void> => {
    await this.launcherManager.refreshGameParametersAsync();
  };

  /**
   * Will make LauncherModule refresh it's internal state
   * Will refresh the ViewModels
   * Will refresh the Validation Cache
   */
  public refreshModulesAsync = async (): Promise<void> => {
    await this.launcherManager.refreshModulesAsync();
    await this.refreshGameParametersAsync();
  };

  public setModulesToLaunchAsync = async (
    loadOrder: vetypes.LoadOrder,
  ): Promise<void> => {
    await this.launcherManager.setGameParameterLoadOrderAsync(loadOrder);
    await this.refreshGameParametersAsync();
  };

  /**
   * Will update the CLI args with the save name
   * @param saveName if null will exclude if from the CLI
   */
  public setSaveFileAsync = async (saveName: string): Promise<void> => {
    await this.launcherManager.setGameParameterSaveFileAsync(saveName);
    await this.refreshGameParametersAsync();
  };

  /**
   * Will update the CLI args with continuing the latest save file
   * @param saveName if null will exclude if from the CLI
   */
  public setContinueLastSaveFileAsync = async (
    value: boolean,
  ): Promise<void> => {
    await this.launcherManager.setGameParameterContinueLastSaveFileAsync(value);
    await this.refreshGameParametersAsync();
  };

  /**
   * Returns the currently tracked list of modules by LauncherManager
   * Use @method {refreshModulesVortex} to reload modules from the FS.
   * @return
   */
  public getAllModulesAsync = async (): Promise<Readonly<IModuleCache>> => {
    const modules = await this.launcherManager.getModulesAsync();
    return modules.reduce<IModuleCache>((map, current) => {
      map[current.id] = current;
      return map;
    }, {});
  };

  /**
   * Gets all modules with duplicates - when installed in /Modules and Steam Workshop
   * @return
   */
  public getAllModulesWithDuplicatesAsync = async (): Promise<
    vetypes.ModuleInfoExtendedWithMetadata[]
  > => {
    return await this.launcherManager.getAllModulesAsync();
  };

  /**
   * Will sort the available Modules based on the provided LoadOrder
   * @param loadOrder
   * @returns
   */
  public orderByLoadOrderAsync = async (
    loadOrder: vetypes.LoadOrder,
  ): Promise<vetypes.OrderByLoadOrderResult> => {
    return await this.launcherManager.orderByLoadOrderAsync(loadOrder);
  };

  /**
   * A simple wrapper for Vortex that returns a promise
   */
  public getGameVersionVortexAsync = async (): Promise<string> => {
    return await this.launcherManager.getGameVersionAsync();
  };

  /**
   * Calls LauncherManager's testModule and converts the result to Vortex data
   */
  public testModule = (
    files: string[],
    gameId: string,
  ): Promise<types.ISupportedResult> => {
    if (gameId !== GAME_ID) {
      return Promise.resolve({
        supported: false,
        requiredFiles: [],
      });
    }

    const result = this.launcherManager.testModule(files);
    return Promise.resolve({
      supported: result.supported,
      requiredFiles: result.requiredFiles,
    });
  };

  /**
   * Calls LauncherManager's installModule and converts the result to Vortex data
   */
  public installModuleAsync = async (
    files: string[],
    destinationPath: string,
    archivePath: string | undefined,
  ): Promise<types.IInstallResult> => {
    return await installModuleAsync(
      files,
      destinationPath,
      archivePath,
      this.api,
      this.launcherManager,
    );
  };

  public isObfuscatedAsync = async (
    module: vetypes.ModuleInfoExtendedWithMetadata,
  ): Promise<boolean> => {
    return await this.launcherManager.isObfuscatedAsync(module);
  };

  public isSorting = (): boolean => {
    return this.launcherManager.isSorting();
  };

  public autoSortAsync = async (): Promise<void> => {
    await this.launcherManager.sortAsync();
  };

  public getSaveFilesAsync = async (): Promise<vetypes.SaveMetadata[]> => {
    return await this.launcherManager.getSaveFilesAsync();
  };

  /**
   * Sets the game store manually, since the launcher manager is not perfect.
   */
  public setStore = (storeId: string): void => {
    this.launcherManager.setGameStore(vortexStoreToLibraryStore(storeId));
  };
}

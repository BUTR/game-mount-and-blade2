import { actions, selectors, types, util } from 'vortex-api';
import { allocWithoutOwnership, NativeLauncherManager, types as vetypes } from '@butr/vortexextensionnative';
import path from 'path';
import { FileHandle, open, readdir, rm, writeFile } from 'node:fs/promises';
import { vortexStoreToLibraryStore } from './utils';
import { installModuleAsync } from './installer';
import { hasPersistentLoadOrder } from '../vortex';
import { actionsLoadOrder, libraryToLibraryVM, libraryVMToVortex, vortexToLibraryVM } from '../loadOrder';
import { getBetaSortingFromSettings } from '../settings';
import { filterEntryWithInvalidId } from '../utils';
import { GAME_ID } from '../common';
import { IModuleCache, VortexLoadOrderStorage } from '../types';
import { LocalizationManager } from '../localization';

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
    this.launcherManager = new NativeLauncherManager(
      this.setGameParametersAsync,
      this.sendNotificationAsync,
      this.sendDialogAsync,
      this.getInstallPathAsync,
      this.readFileContentAsync,
      this.writeFileContentAsync,
      this.readDirectoryFileListAsync,
      this.readDirectoryListAsync,
      this.getAllModuleViewModelsAsync,
      this.getModuleViewModelsAsync,
      this.setModuleViewModelsAsync,
      this.getOptionsAsync,
      this.getStateAsync
    );

    this.api = api;
  }

  /**
   * Gets the LoadOrder from Vortex's Load Order Page
   */
  private getLoadOrderFromVortex = (): VortexLoadOrderStorage => {
    const state = this.api.getState();
    const profile: types.IProfile | undefined = selectors.activeProfile(state);
    if (!hasPersistentLoadOrder(state.persistent)) {
      return [];
    }

    const loadOrder = state.persistent.loadOrder[profile.id] ?? [];
    if (!Array.isArray(loadOrder)) {
      return [];
    }
    return loadOrder.filter((x) => x?.data && filterEntryWithInvalidId(x));
  };

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

  public setModulesToLaunchAsync = async (loadOrder: vetypes.LoadOrder): Promise<void> => {
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
  public setContinueLastSaveFileAsync = async (value: boolean): Promise<void> => {
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
  public getAllModulesWithDuplicatesAsync = async (): Promise<vetypes.ModuleInfoExtendedWithMetadata[]> => {
    return await this.launcherManager.getAllModulesAsync();
  };

  /**
   * Will sort the available Modules based on the provided LoadOrder
   * @param loadOrder
   * @returns
   */
  public orderByLoadOrderAsync = async (loadOrder: vetypes.LoadOrder): Promise<vetypes.OrderByLoadOrderResult> => {
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
  public testModule = (files: string[], gameId: string): Promise<types.ISupportedResult> => {
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
    archivePath: string | undefined
  ): Promise<types.IInstallResult> => {
    return await installModuleAsync(files, destinationPath, archivePath, this.api, this.launcherManager);
  };

  /**
   *
   * @returns
   */
  public isObfuscatedAsync = async (module: vetypes.ModuleInfoExtendedWithMetadata): Promise<boolean> => {
    return await this.launcherManager.isObfuscatedAsync(module);
  };

  /**
   *
   * @returns
   */
  public isSorting = (): boolean => {
    return this.launcherManager.isSorting();
  };

  /**
   *
   */
  public autoSortAsync = async (): Promise<void> => {
    await this.launcherManager.sortAsync();
  };

  /**
   *
   */
  public getSaveFilesAsync = async (): Promise<vetypes.SaveMetadata[]> => {
    return await this.launcherManager.getSaveFilesAsync();
  };

  /**
   * Sets the game store manually, since the launcher manager is not perfect.
   */
  public setStore = (storeId: string): void => {
    this.launcherManager.setGameStore(vortexStoreToLibraryStore(storeId));
  };

  /**
   * Callback
   */
  private setGameParametersAsync = (_executable: string, gameParameters: string[]): Promise<void> => {
    const params = gameParameters.filter((x) => x !== ' ' && x.length > 0).join(' ');

    const state = this.api.getState();
    const discovery: types.IDiscoveryResult | undefined = selectors.currentGameDiscovery(state);
    const cliTools = Object.values(discovery?.tools ?? {}).filter((tool) => tool.id && tool.id.endsWith('-cli'));
    const batchedActions = cliTools.map((tool) =>
      actions.addDiscoveredTool(GAME_ID, tool.id, { ...tool, parameters: [params] }, true)
    );
    const gameParamAction = actions.setGameParameters(GAME_ID, { parameters: [params] });
    util.batchDispatch(this.api.store?.dispatch, [...batchedActions, gameParamAction]);

    return Promise.resolve();
  };
  /**
   * Callback
   */
  private sendNotificationAsync = (
    id: string,
    type: vetypes.NotificationType,
    message: string,
    delayMS: number
  ): Promise<void> => {
    switch (type) {
      case 'hint':
        this.api.sendNotification?.({
          id: id,
          type: 'activity',
          message: message,
          displayMS: delayMS,
        });
        break;
      case 'info':
        this.api.sendNotification?.({
          id: id,
          type: 'info',
          message: message,
          displayMS: delayMS,
        });
        break;
      case 'warning':
        this.api.sendNotification?.({
          id: id,
          type: 'warning',
          message: message,
          displayMS: delayMS,
        });
        break;
      case 'error':
        this.api.sendNotification?.({
          id: id,
          type: 'error',
          message: message,
          displayMS: delayMS,
        });
        break;
    }

    return Promise.resolve();
  };
  /**
   * Callback
   */
  private sendDialogAsync = async (
    type: vetypes.DialogType,
    title: string,
    message: string,
    filters: vetypes.FileFilter[]
  ): Promise<string> => {
    const { localize: t } = LocalizationManager.getInstance(this.api);

    switch (type) {
      case 'warning': {
        const messageFull = message.split('--CONTENT-SPLIT--', 2).join('\n');
        const no = t('No');
        const yes = t('Yes');
        const result = await this.api.showDialog?.('question', title, { message: messageFull }, [
          { label: no },
          { label: yes },
        ]);
        switch (result?.action) {
          case yes:
            return 'true';
          case no:
            return 'false';
          default:
            return '';
        }
      }
      case 'fileOpen': {
        const filtersTransformed = filters.map<types.IFileFilter>((x) => ({
          name: x.name,
          extensions: x.extensions,
        }));
        const result = await this.api.selectFile({
          filters: filtersTransformed,
        });
        return result;
      }
      case 'fileSave': {
        const fileName = message;
        const filtersTransformed = filters.map<types.IFileFilter>((x) => ({
          name: x.name,
          extensions: x.extensions,
        }));
        const result = await this.api.saveFile({
          filters: filtersTransformed,
          defaultPath: fileName,
        });
        return result;
      }
    }
  };
  /**
   * Callback
   */
  private getInstallPathAsync = (): Promise<string> => {
    const state = this.api.getState();
    const discovery: types.IDiscoveryResult | undefined = selectors.currentGameDiscovery(state);
    return Promise.resolve(discovery?.path ?? '');
  };
  /**
   * Callback
   */
  private readFileContentAsync = async (
    filePath: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | null> => {
    try {
      let fileHandle: FileHandle | null = null;
      try {
        fileHandle = await open(filePath, 'r');
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
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(this.api);
      this.api.showErrorNotification?.(t('Error reading file content'), err);
    }
    return null;
  };
  /**
   * Callback
   */
  private writeFileContentAsync = async (filePath: string, data: Uint8Array): Promise<void> => {
    try {
      if (data === null) {
        await rm(filePath);
      } else {
        await writeFile(filePath, data);
      }
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return;
      }
      const { localize: t } = LocalizationManager.getInstance(this.api);
      this.api.showErrorNotification?.(t('Error writing file content'), err);
    }
  };
  /**
   * Callback
   */
  private readDirectoryFileListAsync = async (directoryPath: string): Promise<string[] | null> => {
    try {
      const dirs = await readdir(directoryPath, { withFileTypes: true });
      const res = dirs.filter((x) => x.isFile()).map<string>((x) => path.join(directoryPath, x.name));
      return res;
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(this.api);
      this.api.showErrorNotification?.(t('Error reading directory file list'), err);
    }
    return null;
  };
  /**
   * Callback
   */
  private readDirectoryListAsync = async (directoryPath: string): Promise<string[] | null> => {
    try {
      const dirs = await readdir(directoryPath, { withFileTypes: true });
      const res = dirs.filter((x) => x.isDirectory()).map<string>((x) => path.join(directoryPath, x.name));
      return res;
    } catch (err) {
      // ENOENT means that a file or folder is not found, it's an expected error
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(this.api);
      this.api.showErrorNotification?.(t('Error reading directory list'), err);
    }
    return null;
  };
  /**
   * Callback
   * Returns the ViewModels that are currenty displayed by Vortex
   */
  private getModuleViewModelsAsync = async (): Promise<vetypes.ModuleViewModel[] | null> => {
    const allModules = await this.getAllModulesAsync();
    const loadOrder = this.getLoadOrderFromVortex();
    const viewModels = vortexToLibraryVM(loadOrder, allModules);
    const result = Object.values(viewModels);
    return result;
  };
  /**
   * Callback
   * Returns all available ViewModels for possible displaying
   */
  private getAllModuleViewModelsAsync = async (): Promise<vetypes.ModuleViewModel[] | null> => {
    const allModules = await this.getAllModulesAsync();
    const existingModuleViewModels = (await this.getModuleViewModelsAsync()) ?? [];
    const modulesToConvert = Object.values(allModules).filter(
      (x) => !existingModuleViewModels.find((y) => y.moduleInfoExtended.id === x.id)
    );

    const viewModels = libraryToLibraryVM(modulesToConvert);
    const result = viewModels.concat(existingModuleViewModels);
    return result;
  };
  /**
   * Callback
   */
  private setModuleViewModelsAsync = (moduleViewModels: vetypes.ModuleViewModel[]): Promise<void> => {
    const profile: types.IProfile | undefined = selectors.activeProfile(this.api.getState());
    const loadOrder = libraryVMToVortex(this.api, moduleViewModels);
    this.api.store?.dispatch(actionsLoadOrder.setFBLoadOrder(profile.id, loadOrder));
    return Promise.resolve();
  };
  /**
   * Callback
   */
  private getOptionsAsync = (): Promise<vetypes.LauncherOptions> => {
    const profile: types.IProfile | undefined = selectors.activeProfile(this.api.getState());
    const betaSorting = getBetaSortingFromSettings(this.api, profile.id) ?? false;
    return Promise.resolve({
      betaSorting: betaSorting,
    });
  };
  /**
   * Callback
   */
  private getStateAsync = (): Promise<vetypes.LauncherState> => {
    return Promise.resolve({
      isSingleplayer: true, // We don't support multiplayer yet
    });
  };
}

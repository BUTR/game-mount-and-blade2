import { actions, fs, selectors, types, util } from 'vortex-api';
import { BannerlordModuleManager, NativeLauncherManager, types as vetypes } from '@butr/vortexextensionnative';
import { Dirent, readFileSync } from 'fs';
import path from 'path';
import { hasPersistentLoadOrder } from '../vortex';
import {
  actionsLoadOrder,
  libraryToLibraryVM,
  libraryToPersistence,
  libraryVMToVortex,
  persistenceToVortex,
  readLoadOrder,
  vortexToLibrary,
  vortexToLibraryVM,
  writeLoadOrder,
} from '../loadOrder';
import { getBetaSortingFromSettings } from '../settings';
import { filterEntryWithInvalidId } from '../util';
import { GAME_ID, SUB_MODS_IDS } from '../../common';
import { IModuleCache, VortexLoadOrderStorage, VortexStoreIds } from '../../types';
import { LocalizationManager } from '../localization';

export class VortexLauncherManager {
  private static _instance: VortexLauncherManager;

  public static getInstance(api: types.IExtensionApi): VortexLauncherManager {
    if (!VortexLauncherManager._instance) {
      if (api === undefined) {
        throw new Error('IniStructure is not context aware');
      }
      VortexLauncherManager._instance = new VortexLauncherManager(api);
    }

    return VortexLauncherManager._instance;
  }

  private launcherManager: NativeLauncherManager;
  private api: types.IExtensionApi;

  public constructor(api: types.IExtensionApi) {
    this.launcherManager = new NativeLauncherManager(
      this.setGameParameters,
      this.loadLoadOrder,
      this.saveLoadOrder,
      this.sendNotification,
      this.sendDialog,
      this.getInstallPath,
      this.readFileContent,
      this.writeFileContent,
      this.readDirectoryFileList,
      this.readDirectoryList,
      this.getAllModuleViewModels,
      this.getModuleViewModels,
      this.setModuleViewModels,
      this.getOptions,
      this.getState
    );

    this.api = api;
  }

  /**
   * Gets the LoadOrder from Vortex's Load Order Page
   */
  private getLoadOrderFromVortex = (): VortexLoadOrderStorage => {
    const state = this.api.getState();
    const profile = selectors.activeProfile(state);
    if (!hasPersistentLoadOrder(state.persistent)) {
      return [];
    }

    const loadOrder = state.persistent.loadOrder[profile.id] ?? [];
    if (!Array.isArray(loadOrder)) {
      return [];
    }
    return loadOrder.filter((x) => !!x && !!x.data && filterEntryWithInvalidId(x));
  };

  public loadLoadOrderVortex = (): vetypes.LoadOrder => {
    return this.launcherManager.loadLoadOrder();
  };

  public saveLoadOrderVortex = (loadOrder: vetypes.LoadOrder): void => {
    this.launcherManager.saveLoadOrder(loadOrder);
  };

  /**
   * Will trigger the LauncherManager to pull the @property {moduleViewModels}
   * And update the LO for the CLI.
   */
  public refreshGameParameters = () => {
    this.launcherManager.refreshGameParameters();
  };

  /**
   * Will make LauncherModule refresh it's internal state
   * Will refresh the ViewModels
   * Will refresh the Validation Cache
   */
  public refreshModules = (): void => {
    this.launcherManager.refreshModules();
    this.refreshGameParameters();
  };

  public setModulesToLaunch = (loadOrder: vetypes.LoadOrder): void => {
    this.launcherManager.setGameParameterLoadOrder(loadOrder);
    this.refreshGameParameters();
  };

  /**
   * Will update the CLI args with the save name
   * @param saveName if null will exclude if from the CLI
   */
  public setSaveFile = (saveName: string) => {
    this.launcherManager.setGameParameterSaveFile(saveName);
    this.refreshGameParameters();
  };

  /**
   * Will update the CLI args with continuing the latest save file
   * @param saveName if null will exclude if from the CLI
   */
  public setContinueLastSaveFile = (value: boolean) => {
    this.launcherManager.setGameParameterContinueLastSaveFile(value);
    this.refreshGameParameters();
  };

  /**
   * Returns the currently tracked list of modules by LauncherManager
   * Use @method {refreshModulesVortex} to reload modules from the FS.
   * @return
   */
  public getAllModules = (): Readonly<IModuleCache> => {
    return this.launcherManager.getModules().reduce<IModuleCache>((map, current) => {
      map[current.id] = current;
      return map;
    }, {});
  };

  /**
   * Gets all modules with duplicates - when installed in /Modules and Steam Workshop
   * @return
   */
  public getAllModulesWithDuplicates = (): vetypes.ModuleInfoExtendedWithMetadata[] => {
    return this.launcherManager.getAllModules();
  };

  /**
   * Will sort the available Modules based on the provided LoadOrder
   * @param loadOrder
   * @returns
   */
  public orderByLoadOrder = (loadOrder: vetypes.LoadOrder): vetypes.OrderByLoadOrderResult => {
    return this.launcherManager.orderByLoadOrder(loadOrder);
  };

  /**
   * A simple wrapper for Vortex that returns a promise
   */
  public getGameVersionVortexAsync = (): Promise<string> => {
    return Promise.resolve(this.launcherManager.getGameVersion());
  };

  /**
   * A simple wrapper for Vortex that returns a promise
   */
  public getGameVersionVortex = (): string => {
    return this.launcherManager.getGameVersion();
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
    const transformedResult: types.ISupportedResult = {
      supported: result.supported,
      requiredFiles: result.requiredFiles,
    };
    return Promise.resolve(transformedResult);
  };

  /**
   * Calls LauncherManager's installModule and converts the result to Vortex data
   */
  public installModule = (files: string[], destinationPath: string): Promise<types.IInstallResult> => {
    const subModuleRelFilePath = files.find((x) => x.endsWith('SubModule.xml'))!;
    const subModuleFilePath = path.join(destinationPath, subModuleRelFilePath);
    const subModuleFile = readFileSync(subModuleFilePath, {
      encoding: 'utf-8',
    });
    const moduleInfo = BannerlordModuleManager.getModuleInfoWithMetadata(
      subModuleFile,
      vetypes.ModuleProviderType.Default,
      subModuleRelFilePath
    )!;
    moduleInfo.path = subModuleRelFilePath; // TODO: fix the library

    const result = this.launcherManager.installModule(files, [moduleInfo]);
    const subModsIds = Array<string>();
    const transformedResult: types.IInstallResult = {
      instructions: result.instructions.reduce<types.IInstruction[]>((map, current) => {
        switch (current.type) {
          case 'Copy':
            map.push({
              type: 'copy',
              source: current.source ?? '',
              destination: current.destination ?? '',
            });
            break;
          case 'ModuleInfo':
            if (current.moduleInfo !== undefined) {
              subModsIds.push(current.moduleInfo.id);
            }
            break;
        }
        return map;
      }, []),
    };
    transformedResult.instructions.push({
      type: 'attribute',
      key: SUB_MODS_IDS,
      value: subModsIds,
    });

    return Promise.resolve(transformedResult);
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
  public autoSort = () => {
    this.launcherManager.sort();
  };

  /**
   *
   */
  public getSaveFiles = (): vetypes.SaveMetadata[] => {
    return this.launcherManager.getSaveFiles();
  };

  /**
   * Sets the game store manually, since the launcher manager is not perfect.
   */
  public setStore = (storeId: string) => {
    switch (storeId) {
      case VortexStoreIds.Steam:
        this.launcherManager.setGameStore(`Steam`);
        break;
      case VortexStoreIds.GOG:
        this.launcherManager.setGameStore(`GOG`);
        break;
      case VortexStoreIds.Epic:
        this.launcherManager.setGameStore(`Epic`);
        break;
      case VortexStoreIds.Xbox:
        this.launcherManager.setGameStore(`Xbox`);
        break;
      default:
        this.launcherManager.setGameStore(`Unknown`);
        break;
    }
  };

  /**
   * Callback
   */
  private setGameParameters = (_executable: string, gameParameters: string[]): void => {
    const params = gameParameters.filter((x) => x !== ' ' && x.length > 0).join(' ');

    const discovery = selectors.currentGameDiscovery(this.api.getState());
    const cliTools = Object.values(discovery?.tools ?? {}).filter((tool) => tool.id && tool.id.endsWith('-cli'));
    const batchedActions = cliTools.map((tool) =>
      actions.addDiscoveredTool(GAME_ID, tool.id, { ...tool, parameters: [params] }, true)
    );
    const gameParamAction = actions.setGameParameters(GAME_ID, { parameters: [params] });
    util.batchDispatch(this.api.store?.dispatch, [...batchedActions, gameParamAction]);
  };
  /**
   * Callback
   * Returns the Load Order saved in Vortex's permantent storage
   */
  private loadLoadOrder = (): vetypes.LoadOrder => {
    const allModules = this.getAllModules();

    const savedLoadOrder = persistenceToVortex(this.api, allModules, readLoadOrder(this.api));

    let index = savedLoadOrder.length;
    for (const module of Object.values(allModules)) {
      if (savedLoadOrder.find((x) => x.id === module.id) === undefined)
        savedLoadOrder.push({
          id: module.id,
          enabled: false,
          name: module.name,
          data: {
            moduleInfoExtended: module,
            index: index++,
          },
        });
    }

    const loadOrderConverted = vortexToLibrary(savedLoadOrder);
    return loadOrderConverted;
  };
  /**
   * Callback
   * Saves the Load Order in Vortex's permantent storage
   */
  private saveLoadOrder = (loadOrder: vetypes.LoadOrder): void => {
    writeLoadOrder(this.api, libraryToPersistence(loadOrder));
  };
  /**
   * Callback
   */
  private sendNotification = (id: string, type: vetypes.NotificationType, message: string, delayMS: number): void => {
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
  };
  /**
   * Callback
   */
  private sendDialog = async (
    type: vetypes.DialogType,
    title: string,
    message: string,
    filters: vetypes.FileFilter[]
  ): Promise<string> => {
    const { localize: t } = LocalizationManager.getInstance(this.api);

    switch (type) {
      case 'warning': {
        const messageFull = message.split('--CONTENT-SPLIT--', 2).join('\n');
        const result = await this.api.showDialog?.('question', title, { message: messageFull }, [
          { label: t('No'), action: () => 'false' },
          { label: t('Yes'), action: () => 'true' },
        ]);
        return result?.action ?? '';
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
  private getInstallPath = (): string => {
    const state = this.api.getState();
    const discovery = selectors.currentGameDiscovery(state);
    return discovery?.path ?? '';
  };
  /**
   * Callback
   */
  private readFileContent = (filePath: string, offset: number, length: number): Uint8Array | null => {
    try {
      if (offset === 0 && length === -1) {
        return fs.readFileSync(filePath);
      } else if (offset >= 0 && length > 0) {
        // TODO: read the chunk we actually need, but there's no readFile()
        //const fd = fs.openSync(filePath, 'r');
        //const buffer = Buffer.alloc(length);
        //fs.readSync(fd, buffer, offset, length, 0);
        return fs.readFileSync(filePath).slice(offset, offset + length);
      } else {
        return null;
      }
    } catch {
      return null;
    }
  };
  /**
   * Callback
   */
  private writeFileContent = (filePath: string, data: Uint8Array): void => {
    try {
      return fs.writeFileSync(filePath, data);
    } catch {
      /* ignore error */
    }
  };
  /**
   * Callback
   */
  private readDirectoryFileList = (directoryPath: string): string[] | null => {
    try {
      return fs
        .readdirSync(directoryPath, { withFileTypes: true })
        .filter((x: Dirent) => x.isFile())
        .map<string>((x: Dirent) => path.join(directoryPath, x.name));
    } catch {
      return null;
    }
  };
  /**
   * Callback
   */
  private readDirectoryList = (directoryPath: string): string[] | null => {
    try {
      return fs
        .readdirSync(directoryPath, { withFileTypes: true })
        .filter((x: Dirent) => x.isDirectory())
        .map<string>((x: Dirent) => path.join(directoryPath, x.name));
    } catch {
      return null;
    }
  };
  /**
   * Callback
   * Returns the ViewModels that are currenty displayed by Vortex
   */
  private getModuleViewModels = (): vetypes.ModuleViewModel[] | null => {
    const allModules = this.getAllModules();
    const loadOrder = this.getLoadOrderFromVortex();
    const viewModels = vortexToLibraryVM(loadOrder, allModules);
    const result = Object.values(viewModels);
    return result;
  };
  /**
   * Callback
   * Returns all available ViewModels for possible displaying
   */
  private getAllModuleViewModels = (): vetypes.ModuleViewModel[] | null => {
    const allModules = this.getAllModules();
    const existingModuleViewModels = this.getModuleViewModels() ?? [];
    const modulesToConvert = Object.values(allModules).filter(
      (x) => existingModuleViewModels.find((y) => y.moduleInfoExtended.id === x.id) === undefined
    );

    const viewModels = libraryToLibraryVM(modulesToConvert);
    const result = viewModels.concat(existingModuleViewModels);
    return result;
  };
  /**
   * Callback
   */
  private setModuleViewModels = (moduleViewModels: vetypes.ModuleViewModel[]): void => {
    const profile = selectors.activeProfile(this.api.getState());
    const loadOrder = libraryVMToVortex(this.api, moduleViewModels);
    this.api.store?.dispatch(actionsLoadOrder.setFBLoadOrder(profile.id, loadOrder));
  };
  /**
   * Callback
   */
  private getOptions = (): vetypes.LauncherOptions => {
    const profile = selectors.activeProfile(this.api.getState());
    const betaSorting = getBetaSortingFromSettings(this.api, profile.id) ?? false;

    return {
      betaSorting: betaSorting,
    };
  };
  /**
   * Callback
   */
  private getState = (): vetypes.LauncherState => {
    return {
      isSingleplayer: true, // We don't support multiplayer yet
    };
  };
}

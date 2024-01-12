import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { Dirent, readFileSync } from 'fs';
import path from 'path';
import { actions, fs, selectors, types, util } from "vortex-api";
import { NativeLauncherManager, BannerlordModuleManager, types as vetypes } from "@butr/vortexextensionnative";
import { vortexToLibrary, libraryVMToVortex, vortexToLibraryVM, persistenceToVortex, libraryToPersistence, writeLoadOrder, readLoadOrder } from "..";
import { GAME_ID } from "../../common";
import { IModuleCache, VortexLoadOrderStorage } from "../../types";

export class VortexLauncherManager {
  private _launcherManager: NativeLauncherManager;
  private _context: types.IExtensionContext;

  public constructor(context: types.IExtensionContext) {
    this._launcherManager = new NativeLauncherManager(
      this.setGameParameters,
      this.loadLoadOrderVortex,
      this.saveLoadOrderVortex,
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
      this.getState,
    );

    this._context = context;

    fs.readdirSync(__dirname, { withFileTypes: true}).forEach((d: Dirent) => {
      if (d.isFile() && d.name.startsWith('localization_') && d.name.endsWith(".xml")) {
        const content: string = fs.readFileSync(`${__dirname}/${d.name}`, { encoding: 'utf8' });
        this._launcherManager.loadLocalization(content);
      }
    });
  }

  /**
   * Gets the LoadOrder from Vortex's Load Order Page
   */
  private getLoadOrderFromVortex = (): VortexLoadOrderStorage => {
    const state = this._context.api.getState();
    const activeProfileId = selectors.lastActiveProfileForGame(state, GAME_ID);
    const loadOrder = util.getSafe<VortexLoadOrderStorage>(state, [`persistent`, `loadOrder`, activeProfileId], []);
    return loadOrder;
  };


  /**
   * Will make LauncherModule refresh it's internal state
   * Will refresh the ViewModels
   * Will refresh the Validation Cache
   */
  public refreshModules = (): void => {
    this._launcherManager.refreshModules();
  };

  /**
   * Will trigger the LauncherManager to pull the @property {moduleViewModels}
   * And update the LO for the CLI.
   */
  public refreshGameParameters = () => {
    this._launcherManager.refreshGameParameters();
  }

  /**
   * Will update the CLI args with the save name
   * @param saveName if null will exclude if from the CLI
   */
  public setSaveFile = (saveName: string) => {
    this._launcherManager.setGameParameterSaveFile(saveName);
    this.refreshGameParameters();
  }

  /**
   * Will update the CLI args with continuing the latest save file
   * @param saveName if null will exclude if from the CLI
   */
  public setContinueLastSaveFile = (value: boolean) => {
    this._launcherManager.setGameParameterContinueLastSaveFile(value);
    this.refreshGameParameters();
  }

  /**
   * Returns the currently tracked list of modules by LauncherManager
   * Use @method {refreshModulesVortex} to reload modules from the FS.
   * @return
   */
  public getAvailableModules = (): Readonly<IModuleCache> => {
    return this._launcherManager.getModules().reduce<IModuleCache>((map, current) => {
      map[current.id] = current;
      return map;
    }, { });
  };

  /**
   * Will sort the available Modules based on the provided LoadOrder
   * @param loadOrder 
   * @returns 
   */
  public orderByLoadOrder = (loadOrder: vetypes.LoadOrder): vetypes.OrderByLoadOrderResult => {
    return this._launcherManager.orderByLoadOrder(loadOrder);
  }



  /**
   * A simple wrapper for Vortex that returns a promise
   */
  public getGameVersionVortex = (): Bluebird<string> => {
    return Promise.resolve(this._launcherManager.getGameVersion());
  };

  /**
   * Calls LauncherManager's testModule and converts the result to Vortex data
   */
  public testModuleVortex = (files: string[], gameId: string): Bluebird<types.ISupportedResult> => {
    if (gameId !== GAME_ID){
      return Promise.resolve({
        supported: false,
        requiredFiles: []
      });
    }

    const result = this._launcherManager.testModule(files);
    const transformedResult: types.ISupportedResult = {
      supported: result.supported,
      requiredFiles: result.requiredFiles
    };
    return Promise.resolve(transformedResult);
  };

  /**
   * Calls LauncherManager's installModule and converts the result to Vortex data
   */
  public installModuleVortex = (files: string[], destinationPath: string): Bluebird<types.IInstallResult> => {
    const subModuleRelFilePath = files.find(x => x.endsWith("SubModule.xml"))!;
    const subModuleFilePath = path.join(destinationPath, subModuleRelFilePath);
    const subModuleFile = readFileSync(subModuleFilePath, { encoding: "utf-8" });
    const moduleInfo = BannerlordModuleManager.getModuleInfoWithPath(subModuleFile, subModuleRelFilePath)!;
    moduleInfo.path = subModuleRelFilePath; // TODO: fix the library

    const result = this._launcherManager.installModule(files, [moduleInfo]);
    const subModsIds = Array<string>();
    const transformedResult: types.IInstallResult = {
      instructions: result.instructions.reduce((map, current) => {
        switch (current.type) {
          case "Copy":
            map.push({
              type: "copy",
              source: current.source,
              destination: current.destination
            });
            break;
          case "ModuleInfo":
            if (current.moduleInfo !== undefined) {
              subModsIds.push(current.moduleInfo.id);
            }
            break;
        }
        return map;
      }, Array<types.IInstruction>()),
    };
    transformedResult.instructions.push({
      type: "attribute",
      key: "subModsIds",
      value: subModsIds,
    });

    return Bluebird.resolve(transformedResult);
  };

  /**
   * 
   * @returns 
   */
  public isSorting = (): boolean => {
    return this._launcherManager.isSorting();
  }

  /**
   * 
   */
  public autoSort = () => {
    this._launcherManager.sort();
  }

  /**
   * 
   */
  public getSaveFiles = (): vetypes.SaveMetadata[] => {
    return this._launcherManager.getSaveFiles();
  }

  /**
   * 
   * @param template 
   * @param values 
   * @returns 
   */
  public localize = (template: string, values: { [key: string]: string }): string => {
    return this._launcherManager.localizeString(template, values);
  }

  /**
   * Sets the game store manually, since the launcher manager is not perfect.
   */
  public setStore = (STORE_ID: string) => {
    switch(STORE_ID){
      case `steam`:
        this._launcherManager.setGameStore(`Steam`);
        break;
      case `gog`:
        this._launcherManager.setGameStore(`GOG`);
        break;
      case `xbox`:
        this._launcherManager.setGameStore(`Xbox`);
        break;
      case `xbox`:
        this._launcherManager.setGameStore(`Xbox`);
        break;
    }
  };


  /**
   * Callback
   */
  private setGameParameters = (executable: string, gameParameters: string[]): void => {
    this._context.api.store?.dispatch(actions.setGameParameters(GAME_ID, { executable: executable, parameters: gameParameters }));
  };
  /**
   * Callback
   * Returns the Load Order saved in Vortex's permantent storage
   */
  public loadLoadOrderVortex = (): vetypes.LoadOrder => {
    const modules = this.getAvailableModules();

    const savedLoadOrder = persistenceToVortex(this._context.api, modules, readLoadOrder(this._context.api));

    let index = savedLoadOrder.length;
    for (const module of Object.values(modules)) {
      if (savedLoadOrder.find(x => x.id === module.id) == undefined)
        savedLoadOrder.push({
          id: module.id,
          enabled: false,
          name: module.name,
          data: {
            moduleInfoExtended: module,
            index: index++,
            isDisabled: false,
          }
      });
    }

    const loadOrderConverted = vortexToLibrary(savedLoadOrder);
    return loadOrderConverted;
  };
  /**
   * Callback
   * Saves the Load Order in Vortex's permantent storage
   */
  public saveLoadOrderVortex = (loadOrder: vetypes.LoadOrder): void=> {
    writeLoadOrder(this._context.api, libraryToPersistence(loadOrder));
  };
  /**
   * Callback
   */
  private sendNotification = (id: string, type: vetypes.NotificationType, message: string, delayMS: number): void => {
    switch(type) {
      case "hint":
        this._context.api.sendNotification?.({ id: id, type: "activity", message: message, displayMS: delayMS, });
        break;
      case "info":
        this._context.api.sendNotification?.({ id: id, type: "info", message: message, displayMS: delayMS, });
        break;
    }
  };
  /**
   * Callback
   */
  private sendDialog = async (type: vetypes.DialogType, title: string, message: string, filters: vetypes.FileFilter[]): Promise<string> => {
    switch(type) {
      case "warning":
      {
        const messageFull = message.split("--CONTENT-SPLIT--", 2).join('\n');
        return new Promise<string>(async resolve => {
          const result = await this._context.api.showDialog?.("question", title, { message: messageFull, }, [
            { label: 'No', action: () => "false" },
            { label: 'Yes', action: () => "true" },
          ]);
          resolve(result?.action ?? '');
        });
      }
      case "fileOpen":
      {
        const filtersTransformed = filters.map<types.IFileFilter>(x => ({ name: x.name, extensions: x.extensions }));
        return new Promise<string>(async resolve => {
          const result = await this._context.api.selectFile({ filters: filtersTransformed});
          resolve(result);
        });
      }
      case "fileSave":
      {
        const fileName = message;
        const filtersTransformed = filters.map<types.IFileFilter>(x => ({ name: x.name, extensions: x.extensions }));
        return new Promise<string>(async resolve => {
          const result = await this._context.api.saveFile({ filters: filtersTransformed, defaultPath: fileName });
          resolve(result);
        });
      }
    }
    return Promise.resolve("");
  };
  /**
   * Callback
   */
  private getInstallPath = (): string => {
    const state: types.IState | undefined = this._context.api.store?.getState();
    if (!state) {
      return "";
    }
    const discovery = selectors.currentGameDiscovery(state);
    return discovery.path || "";
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
    }
  };
  /**
   * Callback
   */
  private readDirectoryFileList = (directoryPath: string): string[] | null => {
    try {
      return fs.readdirSync(directoryPath, { withFileTypes: true }).filter((x: Dirent) => x.isFile()).map((x: Dirent) => path.join(directoryPath, x.name));
    } catch {
      return null;
    }
  };
  /**
   * Callback
   */
  private readDirectoryList = (directoryPath: string): string[] | null => {
    try {
      return fs.readdirSync(directoryPath, { withFileTypes: true }).filter((x: Dirent) => x.isDirectory()).map((x: Dirent) => path.join(directoryPath, x.name));
    } catch {
      return null;
    }
  };
  /**
   * Callback
   */
  private getModuleViewModels = (): vetypes.ModuleViewModel[] | null => {
    const loadOrder = this.getLoadOrderFromVortex();
    const viewModels = vortexToLibraryVM(loadOrder);
    const result = Object.values(viewModels);
    return result;  
  };
  /**
   * Callback
   */
  private getAllModuleViewModels = (): vetypes.ModuleViewModel[] | null => {
    const loadOrder = this.getLoadOrderFromVortex();
    const viewModels = vortexToLibraryVM(loadOrder);
    const result = Object.values(viewModels);
    return result;
  };
  /**
   * Callback
   */
  private setModuleViewModels = (moduleViewModels: vetypes.ModuleViewModel[]): void => {
    const loadOrder = libraryVMToVortex(this._context.api, moduleViewModels);

    const state = this._context.api.getState();
    const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
    const action = {
      type: 'SET_FB_LOAD_ORDER',
      payload: {
        profileId,
        loadOrder,
      },
    };
    this._context.api.store?.dispatch(action);
  };
  /**
   * Callback
   */
  private getOptions = (): vetypes.LauncherOptions => {
    return {
      language: "English",
      unblockFiles: true,
      fixCommonIssues: true,
      betaSorting: false,
    }
  };
  /**
   * Callback
   */
  private getState = (): vetypes.LauncherState => {
    return {
      isSingleplayer: true
    };
  };
}
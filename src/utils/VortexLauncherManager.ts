import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { actions, fs, selectors, types, util } from "vortex-api";
import { IExtensionContext } from "vortex-api/lib/types/api";
import { NativeLauncherManager, BannerlordModuleManager, types as vetypes } from "@butr/vortexextensionnative";
import { GAME_ID } from "../common";
import { IModuleCache, IValidationCache, VortexLoadOrderStorage, VortexLoadOrderEntry, ModuleViewModelStorage } from "../types";
import { setLoadOrder } from "../utils/util";
import { Dirent, readFileSync } from 'fs';

import { resolveModId } from '../utils/util';

export class VortexLauncherManager {
  /**
   * The current module ViewModels that should be displayed by Vortex
   */
  public moduleViewModels: ModuleViewModelStorage = { };

  /**
   * We cache the latest validation result for performance
   */
  private _validation_cache: IValidationCache = { };
  private _launcherManager: NativeLauncherManager;
  private _context: IExtensionContext;

  public constructor(context: IExtensionContext) {
    this._launcherManager = new NativeLauncherManager(
      this.setGameParameters,
      this.loadLoadOrderVortex,
      this.setLoadOrder,
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
   * Returns any validation issues for a module
   */
  public getModuleIssues = (id: string): vetypes.ModuleIssue[] => {
    return this._validation_cache[id] ?? [];
  };

  /**
   * Loads the modules from FS and creates ViewModels fro them.
   * This is not filtered, you need to either manualy filter and order them
   * or call @method {orderBySavedLoadOrder}
   */
  public initializeModuleViewModels = (): void => {
    // Reload the current Module list from FS
    this.refreshModulesVortex();

    // Use the Load Order as the source of metadata
    const loadOrder = this.getLoadOrderFromVortex();

    // We fill the module ViewModels with all available modules
    this.moduleViewModels = this._launcherManager.getModules().reduce<ModuleViewModelStorage>((map, current, index) => {
      const loEntry = loadOrder.find(x => x.id === current.id);
      if (loEntry === undefined) {
        return map;
      }
      map[current.id] = {
        moduleInfoExtended: current,
        isValid: this._validation_cache[current.id] === undefined ? true : this._validation_cache[current.id].length == 0,
        isSelected: loEntry === undefined ? false : loEntry.data?.isSelected ?? false,
        isDisabled: loEntry === undefined ? false : !loEntry.enabled ?? false,
        index: loEntry?.data?.index ?? index,
      };
      return map;
    }, { });
  };

  /**
   * Uses the Load Order from Vortex's permanent storage to order the currently
   * loaded module ViewModels
   */
  public orderBySavedLoadOrder = () => {
    // Get the currently saved Load Order
    const loadOrder = this.loadLoadOrder();

    // Order the current list of model ViewModels with the current Load Order.
    // The result will fe filtered and ordered list of ViewModels
    const orderByLoadOrderResult = this._launcherManager.orderByLoadOrder(loadOrder);
    if (orderByLoadOrderResult.result && orderByLoadOrderResult.orderedModuleViewModels) {
      this.moduleViewModels = orderByLoadOrderResult.orderedModuleViewModels.reduce<ModuleViewModelStorage>((map, current) => {
        map[current.moduleInfoExtended.id] = current;
        return map;
      }, { });
    };
  };

  /**
   * Will make LauncherModule refresh it's internal state
   * Will refresh the ViewModels
   * Will refresh the Validation Cache
   */
  public refreshModulesVortex = (): void => {
    this._launcherManager.refreshModules();

    const modules = this.getModulesVortex();
    const moduleValues = Object.values(modules);

    const loadOrder = this.getLoadOrderFromVortex();
    this.moduleViewModels = this._launcherManager.getModules().reduce<ModuleViewModelStorage>((map, current, index) => {
      const loEntry = loadOrder.find(x => x.id === current.id);
      map[current.id] = {
        moduleInfoExtended: current,
        isValid: this._validation_cache[current.id] === undefined ? true : this._validation_cache[current.id].length == 0,
        isSelected: loEntry === undefined ? false : loEntry.data?.isSelected ?? false,
        isDisabled: loEntry === undefined ? false : !loEntry.enabled ?? false,
        index,
      };
      return map;
    }, { });

    this._validation_cache = moduleValues.reduce((map, module) => {
      const validationManager: vetypes.IValidationManager = {
        isSelected: (moduleId: string): boolean => {
          const viewModel = this.moduleViewModels[moduleId];
          if (viewModel !== undefined) {
            return viewModel.isSelected ?? false;
          }
          return false;
        }
      };
      map[module.id] = BannerlordModuleManager.validateModule(moduleValues, module, validationManager);
      return map;
    }, {} as IValidationCache);
    this.saveLoadOrder(this.loadLoadOrder());
  };

  public setGameParameterSaveFile = (saveName: string) => {
    this._launcherManager.setGameParameterSaveFile(saveName);
  }

  /**
   * Returns the currently tracked list of modules by LauncherManager
   * Use @method {refreshModulesVortex} to reload modules from the FS.
   * @return {Window}
   */
  public getModulesVortex = (): Readonly<IModuleCache> => {
    return this._launcherManager.getModules().reduce<IModuleCache>((map, current) => {
      map[current.id] = current;
      return map;
    }, { });
  };

  /**
   * I don't get data from the load order.
   * Available: enabled, locked, pos
   * Others are not
   */
  public setLoadOrder = (): void=> {
    this._launcherManager.refreshGameParameters();
  };

  public getGameVersion = (): vetypes.ApplicationVersion => {
    return BannerlordModuleManager.parseApplicationVersion(this._launcherManager.getGameVersion());
  }

  /**
   * A simple wrapper for Vortex that returns a promise
   */
  public getGameVersionVortex = (): Bluebird<string> => {
    return Promise.resolve(this._launcherManager.getGameVersion());
  };

  public setLoadOrderEntry = (profileId: string, modId: string, entry: VortexLoadOrderEntry): void=> {
    this._context.api.store?.dispatch(actions.setLoadOrderEntry(profileId, modId, entry));
    this.moduleViewModels[modId].isSelected = entry.data?.isSelected ?? false;

    this.loadLoadOrderVortex();
    this._launcherManager.refreshGameParameters();
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
   * Returns the Load Order saved in Vortex's permantent storage
   */
  public loadLoadOrderVortex = (): vetypes.LoadOrder => {
    return this.loadLoadOrder();
  };

  private getLoadOrderFromVortex = (): VortexLoadOrderStorage => {
    const state = this._context.api.getState();
    const activeProfileId = selectors.lastActiveProfileForGame(state, GAME_ID);
    const loadOrder = util.getSafe<VortexLoadOrderStorage>(state, [`persistent`, `loadOrder`, activeProfileId], []);
    return loadOrder;
  };

  public orderByLoadOrder = (loadOrder: vetypes.LoadOrder): vetypes.OrderByLoadOrderResult => {
    return this._launcherManager.orderByLoadOrder(loadOrder);
  }

  public dialogTestWarning = () => {
    return this._launcherManager.dialogTestWarning();
  }
  public dialogTestFileOpen = () => {
    return this._launcherManager.dialogTestFileOpen();
  }

  public changeModulePosition = (moduleViewModel: vetypes.ModuleViewModel, insertIndex: number) => {
    return this._launcherManager.sortHelperChangeModulePosition(moduleViewModel, insertIndex);
  }

  public isSorting = (): boolean => {
    return this._launcherManager.isSorting();
  }
  public sort = () => {
    this._launcherManager.sort();
  }

  public getSaveFiles = (): vetypes.SaveMetadata[] => {
    return this._launcherManager.getSaveFiles();
  }

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
   */
  private loadLoadOrder = (): vetypes.LoadOrder => {
    const loadOrder = this.getLoadOrderFromVortex();
    return loadOrder.reduce<vetypes.LoadOrder>((map, current, idx) => {
      this._launcherManager.sortHelperChangeModulePosition(this.moduleViewModels[current.id], idx)
      map[current.id] = {
        id: current.id,
        name: current.name,
        isSelected: current.data?.isSelected ?? false,
        index: current.data?.index ?? idx,
      };
      return map;
    }, { });
  };
  /**
   * Callback
   */
  private saveLoadOrder = async (loadOrder: vetypes.LoadOrder): Promise<void> => {
    const transformed = await Object.values(loadOrder).reduce(async (accumP, current, idx) => {
      const map = await accumP;
      if (current.index !== idx) {
        this._launcherManager.sortHelperChangeModulePosition(this.moduleViewModels[current.id], idx)
      }
      const modId = await resolveModId(this._context.api, current.id);
      map.push({
        id: current.id,
        name: current.name,
        enabled: true,
        modId,
        data: {
          id: current.id,
          name: current.name,
          index: idx,
          isSelected: current.isSelected,
        },
      });
      return Promise.resolve(map);
    }, Promise.resolve([]) as any);
    
    setLoadOrder(this._context.api, Object.values(transformed));
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
    const state = this._context.api.store?.getState();
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
    return Object.values(this.moduleViewModels);
  };
  /**
   * Callback
   */
  private getAllModuleViewModels = (): vetypes.ModuleViewModel[] | null => {
    return Object.values(this.moduleViewModels);
  };
  /**
   * Callback
   */
  private setModuleViewModels = (moduleViewModels: vetypes.ModuleViewModel[]): void => {
    this.moduleViewModels = moduleViewModels.reduce<ModuleViewModelStorage>((map, current) => {
      map[current.moduleInfoExtended.id] = current;
      return map;
    }, { });
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
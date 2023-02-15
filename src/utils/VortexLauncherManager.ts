import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { actions, fs, selectors, types, util } from "vortex-api";
import { IExtensionContext } from "vortex-api/lib/types/api";
import { ILoadOrder } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { NativeLauncherManager, BannerlordModuleManager, types as vetypes } from "@butr/vortexextensionnative";
import { GAME_ID } from "../common";
import { Dirent, IModuleCache, IValidationCache, VortexLoadOrderStorage, VortexLoadOrderEntry, ModuleViewModelStorage } from "../types";

export class VortexLauncherManager {
    /**
     * The current module ViewModels that should be displayed by Vortex
     */
    public moduleViewModels: ModuleViewModelStorage = { };
    /**
     * The current module load order
     */
    //private _loadOrder: IVortexLoadOrder = { };
    /**
     * We cache the latest validation result for performance
     */
    private _validation_cache: IValidationCache = { };
    private _launcherManager: NativeLauncherManager;
    private _context: IExtensionContext;


    public constructor(context: IExtensionContext) {
        this._launcherManager = new NativeLauncherManager();;

        this._context = context;

        this._launcherManager.registerCallbacks(
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
            this.getModuleViewModels,
            this.setModuleViewModels,
            this.getOptions,
            this.getState
        );
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
            map[current.id] = {
                moduleInfoExtended: current,
                isValid: this._validation_cache[current.id] === undefined ? true : this._validation_cache[current.id].length == 0,
                isSelected: loadOrder[current.id] === undefined ? false : loadOrder[current.id].data?.isSelected ?? false,
                isDisabled: loadOrder[current.id] === undefined ? false : !loadOrder[current.id].enabled ?? false,
                index: index,
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
            }, { })
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
            map[current.id] = {
                moduleInfoExtended: current,
                isValid: this._validation_cache[current.id] === undefined ? true : this._validation_cache[current.id].length == 0,
                isSelected: loadOrder[current.id] === undefined ? false : loadOrder[current.id].data?.isSelected ?? false,
                isDisabled: loadOrder[current.id] === undefined ? false : !loadOrder[current.id].enabled ?? false,
                index: index,
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
    public setLoadOrder = (_loadOrder: ILoadOrder): void=> {
        //this._loadOrder = loadOrder;
        this._launcherManager.refreshGameParameters();
    };

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
        const result = this._launcherManager.installModule(files, destinationPath);
        const transformedResult: types.IInstallResult = {
            instructions: result.instructions.map(x => {
                let transformed: types.IInstruction;
                switch (x.type) {
                    case "Copy":
                        transformed = {
                            type: "copy",
                            source: x.source,
                            destination: x.destination
                        };
                        break;
                    case "Attribute":
                        if (x.key == "ModuleIds") {
                            x.key = "subModsIds";
                        }
                        transformed = {
                            type: "attribute",
                            key: "subModsIds",
                            value: x.value
                        };
                        break;
                }
                return transformed;
            }),
        };
        return Promise.resolve(transformedResult);
    };

    /**
     * Returns the Load Order saved in Vortex's permantent storage
     */
    public loadLoadOrderVortex = (): vetypes.LoadOrder => {
        return this.loadLoadOrder();
    };

    private getLoadOrderFromVortex = (): VortexLoadOrderStorage => {
        const state = this._context.api.getState();
        const activeProfile = selectors.activeProfile(state);
        const loadOrder = util.getSafe<VortexLoadOrderStorage>(state, [`persistent`, `loadOrder`, activeProfile.id], {});
        //if (Array.isArray(loadOrder)) {
        //    return {};
        //}
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

    public isSorting = (): boolean => {
        return this._launcherManager.isSorting();
    }
    public sort = () => {
        this._launcherManager.sort();
    }

    public getSaveFiles = (): vetypes.SaveMetadata[] => {
        return this._launcherManager.getSaveFiles();
    }


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

        return Object.keys(loadOrder).map(key => ({
            key: key,
            value: loadOrder[key],
        })).reduce<vetypes.LoadOrder>((map, current) => {
            map[current.key] = {
                id: current.key,
                name: current.key,
                isSelected: current.value.data?.isSelected ?? false,
                index: current.value.data?.index ?? -1,
            };
            return map;
        }, { });
    };
    /**
     * Callback
     */
    private saveLoadOrder = (loadOrder: vetypes.LoadOrder): void => {
        const transformed = Object.values(loadOrder).reduce<VortexLoadOrderStorage>((map, current) => {
            map[current.id] = {
                pos: current.index,
                enabled: true,
                data: {
                    id: current.id,
                    name: current.name,
                    index: current.index,
                    isSelected: current.isSelected,
                },
            };
            return map;
        }, { });

        const state = this._context.api.store?.getState();
        const activeProfile = selectors.activeProfile(state);
        if (activeProfile === undefined) {
            return;
        }
        this._context.api.store?.dispatch(actions.setLoadOrder(activeProfile.id, transformed as any));
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
                    const result = await this._context.api.selectFile({filters: filtersTransformed, defaultPath: fileName, create: true});
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
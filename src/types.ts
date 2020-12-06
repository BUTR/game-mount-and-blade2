// old xml
export interface LauncherData {
    singlePlayerSubMods: ModuleData[];
    multiplayerSubMods: ModuleData[];
}
export class ModuleDataCache extends Map<string, ModuleData> {
}

export interface ModuleData {
    subModId: string;
    subModName?: string;
    subModFile?: string;
    vortexId?: string;
    isOfficial?: boolean;
    isLocked?: boolean;
    isMultiplayer?: boolean;
    dependencies?: string[];
    invalid?: {
      cyclic: string[]; // Will hold the submod ids of any detected cyclic dependencies.
      missing: string[];
    };
    enabled?: boolean;
}


// nex xml
export interface ModuleInfo {
    readonly Name: string;
    readonly Id: string;
    readonly Version: string;
    readonly Official: boolean;
    readonly SingleplayerModule: boolean;
    readonly MultiplayerModule: boolean;
    readonly Url: string;
    readonly DependedModules?: DependedModule[];
    readonly DependedModuleMetadatas?: DependedModuleMetadata[];
    readonly SubModules?: SubModuleInfo[];
}

export interface DependedModule {
    readonly Id: string;
}

export enum LoadOrder {
    LoadBeforeThis,
    LoadAfterThis
}

export interface DependedModuleMetadata extends DependedModule {
    readonly Id: string;
    readonly Order: LoadOrder;
    readonly Optional?: boolean;
}

export interface SubModuleInfo {
    readonly Name: string;
    readonly DLLName: string;
    readonly SubModuleClassType: string;
    readonly Assemblies?: string[];
    readonly Tags?: Map<string, string>;
}
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
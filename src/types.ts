import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import {
  AVAILABLE_STORES,
  GAME_ID,
  OBFUSCATED_BINARIES,
  STEAM_BINARIES_ON_XBOX,
  SUB_MODS_IDS,
  SUB_MODS_INFO,
} from "./common";
import { IBannerlordSettings } from "./settings/types";

export type RequiredProperties<T, P extends keyof T> = Omit<T, P> &
  Required<Pick<T, P>>;

export type IModAttributes = types.IMod["attributes"];

/**
 * A module a Vortex mod provides, with what is needed to plan a load order without reading its SubModule.xml.
 * Vortex keeps mod attributes for good, so it holds only what the Servers and Saves pages read
 */
export interface IStagedModuleInfo {
  id: string;
  name: string;
  version: vetypes.ApplicationVersion;
  requiredDependencyIds: string[];
}

export interface IStagedModulesInfo {
  schema: number;
  modules: IStagedModuleInfo[];
}

export interface IBannerlordModAttributes {
  modId: number;
  modName: string;
  version: string;
  source: string;
  [SUB_MODS_IDS]?: string[];
  [SUB_MODS_INFO]?: IStagedModulesInfo;
  [AVAILABLE_STORES]?: string[];
  [STEAM_BINARIES_ON_XBOX]?: boolean;
  [OBFUSCATED_BINARIES]?: boolean;
}

export interface IBannerlordMod extends types.IMod {
  attributes?: IBannerlordModAttributes;
}

/**
 * Bannerlord's mods by id, as Vortex's state holds them, so never changed in place
 */
export interface IBannerlordModStorage extends Readonly<
  Record<string, IBannerlordMod>
> {}

export interface IBannerlordSession {
  useSteamBinariesOnXbox: boolean;
}

export interface PersistenceLoadOrderStorage extends Array<IPersistenceLoadOrderEntry> {}
export interface IPersistenceLoadOrderEntry {
  id: string;
  name: string;
  isSelected: boolean;
  isDisabled: boolean;
  index: number;
}

export interface VortexLoadOrderStorage extends Array<VortexLoadOrderEntry> {}
export interface VortexLoadOrderEntry extends types.ILoadOrderEntry<IVortexViewModelData> {}
export interface IVortexViewModelData {
  moduleInfoExtended: vetypes.ModuleInfoExtendedWithMetadata;
  hasSteamBinariesOnXbox: boolean | null;
  hasObfuscatedBinaries: boolean | null;
  index: number;
}

/**
 * The modules the LauncherManager knows by id. A snapshot, a new one is read when modules change
 */
export interface IModuleCache extends Readonly<
  Record<string, vetypes.ModuleInfoExtendedWithMetadata>
> {}

/**
 * Vortex
 */
export const enum VortexStoreIds {
  Steam = `steam`,
  GOG = `gog`,
  Epic = `epic`,
  Xbox = `xbox`,
}

/**
 * Vortex
 */
export interface IAddedFiles {
  filePath: string;
  candidates: string[];
}

export interface IStateEx extends types.IState {
  persistent: types.IState["persistent"] & {
    loadOrder?: Record<string, VortexLoadOrderStorage>;
  };
  settings: types.IState["settings"] & {
    interface?: types.ISettingsInterface & {
      primaryTool?: Record<string, string>;
    };
  };
}
/**
 * Extension of Vortex's IState with all Redux data this extension introduces.
 * All extension-specific properties are optional since they may not be populated yet.
 */
export interface IStateWithBannerlord extends IStateEx {
  persistent: IStateEx["persistent"] & {
    mods: types.IModTable & {
      [GAME_ID]: IBannerlordModStorage | undefined;
    };
  };
  session: IStateEx["session"] & {
    [GAME_ID]?: IBannerlordSession;
  };
  settings: IStateEx["settings"] & {
    [GAME_ID]?: IBannerlordSettings;
    interface?: types.ISettingsInterface & {
      primaryTool?: {
        [GAME_ID]?: string;
      };
    };
  };
}

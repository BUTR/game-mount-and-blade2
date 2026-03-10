import { types } from "vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import {
  AVAILABLE_STORES,
  GAME_ID,
  OBFUSCATED_BINARIES,
  STEAM_BINARIES_ON_XBOX,
  SUB_MODS_IDS,
} from "./common";
import { IBannerlordSettings } from "./settings/types";

export type RequiredProperties<T, P extends keyof T> = Omit<T, P> &
  Required<Pick<T, P>>;

export type IModAttributes = types.IMod["attributes"];

export interface IBannerlordModAttributes {
  modId: number;
  modName: string;
  version: string;
  source: string;
  [SUB_MODS_IDS]?: string[];
  [AVAILABLE_STORES]?: string[];
  [STEAM_BINARIES_ON_XBOX]?: boolean;
  [OBFUSCATED_BINARIES]?: boolean;
}

export interface IBannerlordMod extends types.IMod {
  attributes?: IBannerlordModAttributes;
}

export interface IBannerlordModStorage extends Record<string, IBannerlordMod> {}

export interface IBannerlordSession {
  useSteamBinariesOnXbox: boolean;
}

export interface PersistenceLoadOrderStorage
  extends Array<IPersistenceLoadOrderEntry> {}
export interface IPersistenceLoadOrderEntry {
  id: string;
  name: string;
  isSelected: boolean;
  isDisabled: boolean;
  index: number;
}

export interface VortexLoadOrderStorage extends Array<VortexLoadOrderEntry> {}
export interface VortexLoadOrderEntry
  extends types.ILoadOrderEntry<IVortexViewModelData> {}
export interface IVortexViewModelData {
  moduleInfoExtended: vetypes.ModuleInfoExtendedWithMetadata;
  hasSteamBinariesOnXbox: boolean | null;
  hasObfuscatedBinaries: boolean | null;
  index: number;
}

export interface IModuleCache
  extends Record<string, vetypes.ModuleInfoExtendedWithMetadata> {}

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

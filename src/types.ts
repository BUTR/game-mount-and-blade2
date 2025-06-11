import { types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { AVAILABLE_STORES, OBFUSCATED_BINARIES, STEAM_BINARIES_ON_XBOX, SUB_MODS_IDS } from './common';

export type RequiredProperties<T, P extends keyof T> = Omit<T, P> & Required<Pick<T, P>>;

export type IStateSession = types.IState['session'];

export type IStatePersistent = types.IState['persistent'];

export type IModAttributes = types.IMod['attributes'];

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

export interface IBannerlordModStorage {
  [modId: string]: IBannerlordMod;
}

export interface IBannerlordSession {
  useSteamBinariesOnXbox: boolean;
}

export type PersistenceLoadOrderStorage = IPersistenceLoadOrderEntry[];
export interface IPersistenceLoadOrderEntry {
  id: string;
  name: string;
  isSelected: boolean;
  isDisabled: boolean;
  index: number;
}

export type VortexLoadOrderStorage = VortexLoadOrderEntry[];
export type VortexLoadOrderEntry = types.ILoadOrderEntry<IVortexViewModelData>;
export interface IVortexViewModelData {
  moduleInfoExtended: vetypes.ModuleInfoExtendedWithMetadata;
  hasSteamBinariesOnXbox: boolean | null;
  hasObfuscatedBinaries: boolean | null;
  index: number;
}

export interface IModuleCache {
  [moduleId: string]: vetypes.ModuleInfoExtendedWithMetadata;
}

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

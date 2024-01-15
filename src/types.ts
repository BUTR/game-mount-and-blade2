import { types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { GAME_ID } from './common';

export interface VortexBannerlordSettings extends types.ISettings {
  [GAME_ID]?: {
    saveList?: {
      saveName?: string;
    }
  }
}

export type PersistenceLoadOrderStorage = PersistenceLoadOrderEntry[];
export interface PersistenceLoadOrderEntry {
  id: string;
  name: string;
  isSelected: boolean;
  isDisabled: boolean;
  index: number;
};

export type VortexLoadOrderStorage = VortexLoadOrderEntry[];
export type VortexLoadOrderEntry = types.ILoadOrderEntry<VortexViewModelData>;
export interface VortexViewModelData {
  moduleInfoExtended: vetypes.ModuleInfoExtendedWithPath;
  index: number;
};

export interface IItemRendererProps<T = any> {
  className: string;
  item: T;
  onRef: (ref: any) => any;
};

export interface IModuleCache {
  [moduleId: string]: vetypes.ModuleInfoExtendedWithPath;
};

export interface IBannerlordModStorage {
  [modId: string]: IBannerlordMod
};
export interface IBannerlordMod extends types.IMod {
  attributes?: IBannerlordModAttributes;
};
export interface IBannerlordModAttributes {
  modId: number;
  version: string;
};

/**
 * Vortex
 */
export const enum VortexStoreIds {
  Steam = `steam`,
  GOG = `gog`,
  Epic = `epic`,
  Xbox = `xbox`,
};

/**
 * Vortex
 */
export interface IDeployment {
  [modType: string]: types.IDeployedFile[];
};

/**
 * Vortex
 */
export interface IAddedFiles {
  filePath: string,
  candidates: string[]
};
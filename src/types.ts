import { types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { GAME_ID } from './common';

export type RequiredProperties<T, P extends keyof T> = Omit<T, P> & Required<Pick<T, P>>;

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
  index: number;
}

export interface IModuleCache {
  [moduleId: string]: vetypes.ModuleInfoExtendedWithMetadata;
}

/**
 * Vortex
 */
export interface IItemRendererProps<T = unknown> {
  className: string;
  item: T;
  onRef: (ref: unknown) => unknown;
}

/**
 * Vortex
 */
export interface IBannerlordModStorage {
  [modId: string]: IBannerlordMod;
}

/**
 * Vortex
 */
export interface IBannerlordMod extends types.IMod {
  attributes?: IBannerlordModAttributes;
}

/**
 * Vortex
 */
export interface IBannerlordModAttributes {
  modId: number;
  version: string;
  source: string;
}

/**
 * Vortex
 */
export interface ISettingsInterfaceWithPrimaryTool extends types.ISettingsInterface {
  primaryTool: {
    [GAME_ID]?: string;
  };
}

/**
 * Vortex
 */
export interface ISettingsWithBannerlord extends types.ISettings {
  [GAME_ID]?: {
    saveList?: {
      saveName?: string;
    };
    sortOnDeploy: {
      [profileId: string]: boolean;
    };
  };
}

/**
 * Vortex
 */
export type IStatePersistent = types.IState['persistent'];

/**
 * Vortex
 */
export interface IStatePersistentWithLoadOrder extends IStatePersistent {
  loadOrder: {
    [profileId: string]: VortexLoadOrderStorage;
  };
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

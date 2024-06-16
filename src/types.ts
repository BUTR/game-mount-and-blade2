import { types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';

export type RequiredProperties<T, P extends keyof T> = Omit<T, P> & Required<Pick<T, P>>;

export type IStatePersistent = types.IState['persistent'];

export type IModAttributes = types.IMod['attributes'];

export interface IBannerlordModAttributes {
  modId: number;
  version: string;
  source: string;
}

export interface IBannerlordMod extends types.IMod {
  attributes?: IBannerlordModAttributes;
}

export interface IBannerlordModStorage {
  [modId: string]: IBannerlordMod;
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

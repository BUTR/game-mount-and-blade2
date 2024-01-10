import { types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';

export type PersistenceLoadOrderStorage = PersistenceLoadOrderEntry[];
export interface PersistenceLoadOrderEntry {
  id: string;
  name: string;
  isSelected: boolean;
  isDisabled: boolean;
  index: number;
}

export type VortexLoadOrderStorage = VortexLoadOrderEntry[];
export type VortexLoadOrderEntry = types.ILoadOrderEntry<VortexViewModelData>;
export interface VortexViewModelData {
  moduleInfoExtended: vetypes.ModuleInfoExtendedWithPath;
  isDisabled: boolean;
  index: number;
}

export interface IItemRendererProps<T = any> {
  className: string;
  item: T;
  onRef: (ref: any) => any;
}

export interface IModuleCache {
  [moduleId: string]: vetypes.ModuleInfoExtendedWithPath;
}

/**
 * Vortex
 */
export interface IDeployment {
  [modType: string]: types.IDeployedFile[];
}

/**
 * Vortex
 */
export interface IAddedFiles {
  filePath: string,
  candidates: string[]
}
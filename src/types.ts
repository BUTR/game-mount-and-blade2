import { types } from 'vortex-api';
import { ILoadOrderEntry } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { types as vetypes } from '@butr/vortexextensionnative';

// Vortex Load Order
export interface VortexLoadOrderEntryData {
  id: string;
  name: string;
  isSelected: boolean;
  index: number;
}

export interface VortexLoadOrderEntry extends ILoadOrderEntry<VortexLoadOrderEntryData> {}
export type VortexLoadOrderStorage = VortexLoadOrderEntry[];

// Vortex Display Item
export interface VortexViewModel extends types.ILoadOrderDisplayItem {
  moduleInfo: vetypes.ModuleInfoExtendedWithPath;
  index: number;
  isSelected: boolean;
  isDisabled: boolean;
  isValid: boolean;
}
export interface VortexViewModelStorage extends Array<VortexViewModel> {

}
// Vortex Display Item

// Map for ModuleViewModel
export interface ModuleViewModelStorage {
  [moduleId: string]: vetypes.ModuleViewModel;
}
// Map for ModuleViewModel

export interface IItemRendererProps {
  className: string;
  item: VortexViewModel;
  onRef: (ref: any) => any;
}

export interface ModsStorage {
  [moduleId: string]: types.IMod;
}


export interface ModuleInfoExtendedWithPathWithVortexMetadata extends vetypes.ModuleInfoExtendedWithPath {
  vortexId?: string;
}
export interface IModuleCache {
  [moduleId: string]: ModuleInfoExtendedWithPathWithVortexMetadata;
}
export interface IValidationCache {
  [moduleId: string]: vetypes.ModuleIssue[];
}

export interface IIncompatibleModule {
  id: string,
  currentVersion: string,
  requiredVersion: string
}

export interface IValidationResult {
  missing: string[];
  incompatible: IIncompatibleModule[];
}

export interface IDeployment {
  [modType: string]: types.IDeployedFile[];
}

export interface IAddedFiles {
  filePath: string,
  candidates: string[]
}
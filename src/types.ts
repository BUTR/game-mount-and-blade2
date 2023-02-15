import { types } from 'vortex-api';
import { ILoadOrder, ILoadOrderEntry } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { types as vetypes } from '@butr/vortexextensionnative';

// Vortex Load Order
export interface VortexLoadOrderEntryData {
  id: string;
  name: string;
  isSelected: boolean;
  index: number;
}
export interface VortexLoadOrderEntry extends ILoadOrderEntry<VortexLoadOrderEntryData> {

}
export interface VortexLoadOrderStorage extends ILoadOrder {
  [moduleId: string]: VortexLoadOrderEntry;
}
// Vortex Load Order

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

/**
 * Bindings for FS
 */
export type Dirent = {
  /**
   * Returns `true` if the `fs.Dirent` object describes a regular file.
   * @since v10.10.0
   */
  isFile(): boolean;
  /**
   * Returns `true` if the `fs.Dirent` object describes a file system
   * directory.
   * @since v10.10.0
   */
  isDirectory(): boolean;
  /**
   * The file name that this `fs.Dirent` object refers to. The type of this
   * value is determined by the `options.encoding` passed to {@link readdir} or {@link readdirSync}.
   * @since v10.10.0
   */
  name: string;
}
import { types } from 'vortex-api';

import { types as vetypes } from '@butr/vortexextensionnative/';

export interface IItemRendererProps {
  className: string;
  item: types.ILoadOrderDisplayItem;
  onRef: (ref: any) => any;
}

export interface IMods {
  [modId: string]: types.IMod;
}

export interface IProps {
  state: types.IState;
  profile: types.IProfile;
  discovery: types.IDiscoveryResult;
  enabledMods: IMods;
}

/*
export interface ISortProps {
  loadOrder?: any;
}
*/

/*
export interface ILoadOrderEntry<T = any> {
  pos: number;
  enabled: boolean;
  prefix?: string;
  data?: T;
  locked?: boolean;
  external?: boolean;
}

export interface ILoadOrder {
  [modId: string]: ILoadOrderEntry;
}
*/

export interface IModuleInfoExtendedExt extends vetypes.ModuleInfoExtended {
  vortexId?: string;
}
export interface IModuleCache {
  [subModId: string]: IModuleInfoExtendedExt;
}
export interface IValidationCache {
  [subModId: string]: vetypes.ModuleIssue[];
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
   * Returns `true` if the `fs.Dirent` object describes a block device.
   * @since v10.10.0
   */
  isBlockDevice(): boolean;
  /**
   * Returns `true` if the `fs.Dirent` object describes a character device.
   * @since v10.10.0
   */
  isCharacterDevice(): boolean;
  /**
   * Returns `true` if the `fs.Dirent` object describes a symbolic link.
   * @since v10.10.0
   */
  isSymbolicLink(): boolean;
  /**
   * Returns `true` if the `fs.Dirent` object describes a first-in-first-out
   * (FIFO) pipe.
   * @since v10.10.0
   */
  isFIFO(): boolean;
  /**
   * Returns `true` if the `fs.Dirent` object describes a socket.
   * @since v10.10.0
   */
  isSocket(): boolean;
  /**
   * The file name that this `fs.Dirent` object refers to. The type of this
   * value is determined by the `options.encoding` passed to {@link readdir} or {@link readdirSync}.
   * @since v10.10.0
   */
  name: string;
}
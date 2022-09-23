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
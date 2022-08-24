import { types } from 'vortex-api';

import { BannerlordModuleManager } from '@butr/blmodulemanagernative/dist/module/lib';
import * as bmmTypes from '@butr/blmodulemanagernative/dist/module/lib';

export interface IProps {
  state: types.IState;
  profile: types.IProfile;
  discovery: types.IDiscoveryResult;
  enabledMods: { [modId: string]: types.IMod };
}

export interface ISortProps {
  bmm: BannerlordModuleManager;
  loadOrder?: any;
}

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

export interface IModuleInfoExtendedExt extends bmmTypes.ModuleInfoExtended {
  vortexId?: string;
}
export interface IModuleCache {
  [subModId: string]: IModuleInfoExtendedExt;
}

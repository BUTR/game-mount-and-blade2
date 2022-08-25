//@ts-ignore
import Bluebird, { Promise } from "bluebird";
import { method as toBluebird } from "bluebird"

import { types } from 'vortex-api';

import { BannerlordModuleManager } from '@butr/blmodulemanagernative/dist/module/lib';
import * as bmmTypes from '@butr/blmodulemanagernative/dist/module/lib';
import { ICollectionsData, IExtendedInterfaceProps } from "./collections/types";


export interface IItemRendererProps {
  className: string;
  item: types.ILoadOrderDisplayItem;
  onRef: (ref: any) => any;
  moduleManager: BannerlordModuleManager;
}

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

type CollectionExtensionGenerate = (gameId: string, includedMods: string[]) => Bluebird<any>;
type CollectionExtensionParse = (gameId: string, collection: ICollectionsData) => Bluebird<void>;
type CollectionExtensionClone = (gameId: string, collection: ICollectionsData, from: types.IMod, to: types.IMod) => Bluebird<void>;
type CollectionExtensionTitle = (t: types.TFunction) => string;
type CollectionExtensionCondition = (state: types.IState, gameId: string) => boolean;

export interface IExtensionContextCollectionFeature {
  registerCollectionFeature:
  (
    id: string,
    
    generate: CollectionExtensionGenerate,

    parse: CollectionExtensionParse,

    clone: CollectionExtensionClone,

    title: CollectionExtensionTitle,

    condition?: CollectionExtensionCondition,

    editComponent?: React.ComponentType<IExtendedInterfaceProps>
  ) => void;
}
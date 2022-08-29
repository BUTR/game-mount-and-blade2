//@ts-ignore
import Bluebird, { Promise } from 'bluebird';
import { method as toBluebird } from 'bluebird';

import { types } from 'vortex-api';

import { ICollection } from 'collections/src/types/ICollection';
import { IExtendedInterfaceProps } from "collections/src/types/IExtendedInterfaceProps";
import { ILoadOrder } from "../types";

export interface ICollectionMB extends ICollection {
  loadOrder: ILoadOrder;
}

export interface IExtensionContextCollectionFeature {
  registerCollectionFeature:
  (
    id: string,
    
    generate: (gameId: string, includedMods: string[]) => Bluebird<any>,

    parse: (gameId: string, collection: ICollection) => Bluebird<void>,

    clone: (gameId: string, collection: ICollection, from: types.IMod, to: types.IMod) => Bluebird<void>,

    title: (t: types.TFunction) => string,

    condition?: (state: types.IState, gameId: string) => boolean,

    editComponent?: React.ComponentType<IExtendedInterfaceProps>
  ) => void;
}

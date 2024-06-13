// eslint-disable-next-line no-restricted-imports
import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types } from 'vortex-api';
import { ICollection, IRevision } from '@nexusmods/nexus-api';
import { ComponentType } from 'react';
import { PersistenceLoadOrderStorage } from '../../types';

export interface ICollectionFeatureProps {
  t: types.TFunction;
  gameId: string;
  collection: types.IMod;
  revisionInfo: IRevision;
}

export interface IHasExtensionContextCollectionFeature {
  registerCollectionFeature: (
    id: string,

    generate: (gameId: string, includedMods: string[]) => Bluebird<unknown>,

    parse: (gameId: string, collection: ICollection) => Bluebird<void>,

    clone: (gameId: string, collection: ICollection, from: types.IMod, to: types.IMod) => Bluebird<void>,

    title: (t: types.TFunction) => string,

    condition?: (state: types.IState, gameId: string) => boolean,

    editComponent?: ComponentType<ICollectionFeatureProps>
  ) => void;
}

export interface IBannerlordCollectionsData {
  hasBLSE: boolean;
  loadOrder: PersistenceLoadOrderStorage;
}

export interface IBannerlordCollections extends ICollection, IBannerlordCollectionsData {}

import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import { selectors, util } from 'vortex-api';

import { IExtensionContext } from "vortex-api/lib/types/api";

import { IMods } from '../types';
import { ICollectionMB } from './types';

import { exportLoadOrder, importLoadOrder } from './loadOrder';

import { CollectionParseError } from './collectionUtil';

export const genCollectionsData = toBluebird(async (context: IExtensionContext, gameId: string, includedMods: string[]): Promise<ICollectionMB> => {
  const { api } = context;
  const state = api.getState();
  const profile = selectors.activeProfile(state);
  const mods = util.getSafe<IMods>(state, [`persistent`, `mods`, gameId], {});
  const loadOrder = await exportLoadOrder(api.getState(), includedMods, mods) || {};
  const collectionData: ICollectionMB = {
    loadOrder,
    info: {
      author: ``,
      authorUrl: ``,
      name: ``,
      description: ``,
      domainName: ``,
      gameVersions: [],
    },
    mods: [],
    modRules: [],
  };
  return collectionData;
});

export const parseCollectionsData = toBluebird(async (context: IExtensionContext, gameId: string, collection: ICollectionMB): Promise<void> => {
  const { api } = context;
  const state = api.getState();
  const profileId: string = selectors.lastActiveProfileForGame(state, gameId);
  const profile = selectors.profileById(state, profileId);
  if (profile?.gameId !== gameId) {
    const collectionName = collection.info?.name !== undefined ? collection.info.name : `Witcher 3 Collection`;
    throw new CollectionParseError(collectionName, `Last active profile is missing`);
  }
  await importLoadOrder(api, collection);
});

//@ts-ignore
import { Promise } from "bluebird";
import { method as toBluebird } from "bluebird"

import { selectors, types, util } from 'vortex-api';

import { GAME_ID } from '../common';

import { ILoadOrder } from '../types';
import { ICollectionMB  } from './types';

import { exportLoadOrder, importLoadOrder } from './loadOrder';

import { CollectionParseError } from './collectionUtil';

export const genCollectionsData = toBluebird(async(context: types.IExtensionContext,
                                         gameId: string,
                                         includedMods: string[]): Promise<ICollectionMB> => {
  const api = context.api;
  const state = api.getState();
  const profile = selectors.activeProfile(state);
  const mods: { [modId: string]: types.IMod } = util.getSafe(state,
    ['persistent', 'mods', gameId], {});
  try {
    const loadOrder: ILoadOrder = await exportLoadOrder(api.getState(), includedMods, mods);
    const collectionData: ICollectionMB = { loadOrder };
    return Promise.resolve(collectionData);
  } catch (err) {
    return Promise.reject(err);
  }
});

export const parseCollectionsData = toBluebird(async (context: types.IExtensionContext,
                                           gameId: string,
                                           collection: ICollectionMB): Promise<void> => {
  const api = context.api;
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, gameId);
  const profile = selectors.profileById(state, profileId);
  if (profile?.gameId !== gameId) {
    const collectionName = collection['info']?.['name'] !== undefined ? collection['info']['name'] : 'Witcher 3 Collection';
    return Promise.reject(new CollectionParseError(collectionName,
      'Last active profile is missing'));
  }
  try {
    await importLoadOrder(api, collection);
  } catch (err) {
    return Promise.reject(err);
  }
});
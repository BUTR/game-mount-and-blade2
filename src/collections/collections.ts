//@ts-ignore
import Bluebird, { Promise } from 'bluebird';
import { method as toBluebird } from 'bluebird';

import { selectors, util } from 'vortex-api';

import { GAME_ID } from '../common';

import { ILoadOrder } from '../types';
import { ICollectionMB  } from './types';

import { exportLoadOrder, importLoadOrder } from './loadOrder';

import { CollectionParseError } from './collectionUtil';
import { IExtensionContext, IMod } from "vortex-api/lib/types/api";

export const genCollectionsData = toBluebird<ICollectionMB, IExtensionContext, string, string[]>(async(context: IExtensionContext, gameId: string, includedMods: string[]): Promise<ICollectionMB> => {
  const api = context.api;
  const state = api.getState();
  const profile = selectors.activeProfile(state);
  const mods: { [modId: string]: IMod } = util.getSafe(state,
    ['persistent', 'mods', gameId], {});
  try {
    const loadOrder: ILoadOrder = await exportLoadOrder(api.getState(), includedMods, mods);
    const collectionData: ICollectionMB = {
      loadOrder,
      info: {
        author: "",
        authorUrl: "",
        name: "",
        description: "",
        domainName: "",
        gameVersions: [],
       },
      mods: [],
      modRules: []
    };
    return Promise.resolve(collectionData);
  } catch (err) {
    return Promise.reject(err);
  }
});

export const parseCollectionsData = toBluebird<void, IExtensionContext, string, ICollectionMB>(async function (context: IExtensionContext, gameId: string, collection: ICollectionMB): Promise<void> {
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
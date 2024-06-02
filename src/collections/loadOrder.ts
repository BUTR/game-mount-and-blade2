/*
import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import {
  actions, selectors, util, types,
} from 'vortex-api';
import { GAME_ID } from '../common';
import { ILoadOrder, IMods } from '../types';

import { CollectionGenerateError, CollectionParseError, genCollectionLoadOrder } from './collectionUtil';
import { ICollectionMB } from "./types";

export const exportLoadOrder = toBluebird(async (state: types.IState, modIds: string[], mods: IMods) : Promise<ILoadOrder | undefined> => {
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    throw new CollectionGenerateError(`Invalid profile id`);
  }

  const loadOrder = util.getSafe<ILoadOrder | undefined>(state, [`persistent`, `loadOrder`, profileId], undefined);
  if (loadOrder === undefined) {
    // This is theoretically "fine" - the user may have simply
    //  downloaded the mods and immediately created the collection
    //  without actually setting up a load order. Alternatively
    //  the game extension itself might be handling the presort functionality
    //  erroneously. Regardless, the collection creation shouldn't be blocked
    //  by the inexistance of a loadOrder.
    return undefined;
  }

  const includedMods = modIds.reduce<IMods>((accum, iter) => {
    if (mods[iter] !== undefined) {
      accum[iter] = mods[iter];
    }
    return accum;
  }, {});

  const filteredLO = genCollectionLoadOrder(loadOrder, includedMods);
  return filteredLO;
});

export const importLoadOrder = toBluebird(async (api: types.IExtensionApi, collection: ICollectionMB) : Promise<void> => {
  const state = api.getState();

  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    throw new CollectionParseError(collection?.info?.name ?? ``, `Invalid profile id`);
  }

  // The mods need to be deployed in order for the load order to be imported correctly.
  return new Promise<void>((resolve, reject) => {
    api.events.emit(`deploy-mods`, (err: any) => {
      if (err) {
        reject(err);
        return;
      }
      api.store?.dispatch(actions.setLoadOrder(profileId, [collection.loadOrder]));
      resolve();
    });
  });
});
*/

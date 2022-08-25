//@ts-ignore
import { Promise } from "bluebird";
import { method as toBluebird } from "bluebird"

import { actions, selectors, types, util } from 'vortex-api';
import { GAME_ID } from '../common';
import { ILoadOrder } from '../types';

import { CollectionGenerateError, CollectionParseError, genCollectionLoadOrder } from './collectionUtil';
import { ICollectionMB } from "./types";

export const exportLoadOrder = toBluebird(async (state: types.IState,
                                                 modIds: string[],
                                                 mods: { [modId: string]: types.IMod })
                                                 : Promise<ILoadOrder> => {
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    return Promise.reject(new CollectionGenerateError('Invalid profile id'));
  }

  const loadOrder: ILoadOrder = util.getSafe(state,
    ['persistent', 'loadOrder', profileId], undefined);
  if (loadOrder === undefined) {
    // This is theoretically "fine" - the user may have simply
    //  downloaded the mods and immediately created the collection
    //  without actually setting up a load order. Alternatively
    //  the game extension itself might be handling the presort functionality
    //  erroneously. Regardless, the collection creation shouldn't be blocked
    //  by the inexistance of a loadOrder.
    return Promise.resolve(undefined);
  }

  const includedMods = modIds.reduce((accum, iter) => {
    if (mods[iter] !== undefined) {
      accum[iter] = mods[iter];
    }
    return accum;
  }, {});
  const filteredLO: ILoadOrder = genCollectionLoadOrder(loadOrder, includedMods);
  return Promise.resolve(filteredLO);
});

export const importLoadOrder = toBluebird(async(api: types.IExtensionApi, collection: ICollectionMB): Promise<void> => {
  const state = api.getState();

  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    return Promise.reject(new CollectionParseError(collection?.['info']?.['name'] || '', 'Invalid profile id'));
  }

  // The mods need to be deployed in order for the load order to be imported
  //  correctly.
  return new Promise<void>((resolve, reject) => {
    api.events.emit('deploy-mods', (err) => {
      if (!!err) {
        return reject(err);
      } else {
        api.store.dispatch(actions.setLoadOrder(profileId, collection.loadOrder as any));
        return resolve();
      }
    });
  });
});

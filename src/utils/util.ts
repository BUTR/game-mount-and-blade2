import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import { actions, selectors, types, util } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';

import { refreshCache } from './subModCache';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID } from '../common';

let STORE_ID: string;

export const findGame = toBluebird<string>(async (): Promise<string> => {
  const game = await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS]);
  STORE_ID = game.gameStoreId;
  return game.gamePath;
});

export const prepareForModding = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: vetypes.VortexExtensionManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  // If game store not found, location may be set manually - allow setup function to continue.
  const findStoreId = (): Bluebird<string | void> => findGame().catch((_err) => Promise.resolve());
  const startSteam = (): Bluebird<void> => findStoreId().then(() => ((STORE_ID === `steam`)
    ? util.GameStoreHelper.launchGameStore(context.api, STORE_ID, undefined, true)
    : Promise.resolve()));

  // Check if we've already set the load order object for this profile and create it if we haven't.
  return startSteam().then(async () => {
    await refreshCache(context);
  }).finally(() => {
    const state = context.api.getState();
    const activeProfile = selectors.activeProfile(state);
    if (activeProfile === undefined) {
      // Valid use case when attempting to switch to
      //  Bannerlord without any active profile.
      manager.setLoadOrder({});
    }
    manager.setLoadOrder(manager.getLoadOrder());
  });
};

/*
export const getLoadOrder = (context: types.IExtensionContext): types.LoadOrder => {
  const state = context.api.getState();
  const activeProfile = selectors.activeProfile(state);
  return util.getSafe<types.LoadOrder>(state, [`persistent`, `loadOrder`, activeProfile.id], []);
};
export const setLoadOrder = (context: types.IExtensionContext, loadOrder: types.LoadOrder): void => {
  const state = context.api.store?.getState();
  const activeProfile = selectors.activeProfile(state);
  context.api.store?.dispatch(actions.setLoadOrder(activeProfile.id, loadOrder));
  //manager.setLoadOrder((loadOrder || []) as any);
};
*/
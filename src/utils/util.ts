import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { fs, types, util } from 'vortex-api';
import { EPICAPP_ID, GAME_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from '../common';

export const getPathExistsAsync = (path: string): Bluebird<boolean> =>
  fs.statAsync(path).then(() => true).catch(() => false);

export const findGame = toBluebird<types.IGameStoreEntry>((): Bluebird<types.IGameStoreEntry> =>
  util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]));

export const getBannerlordDiscovery = (api: types.IExtensionApi): types.IDiscoveryResult | undefined => {
  const state = api.getState();
  const discovery = state.settings.gameMode.discovered[GAME_ID];
  return discovery;
};
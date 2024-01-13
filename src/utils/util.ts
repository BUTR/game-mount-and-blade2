import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { fs, types, util } from 'vortex-api';
import { VortexLauncherManager, recommendBLSE } from '.';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID, BLSE_EXE } from '../common';

let STORE_ID: string;

const getPathExistsAsync = async (path: string) => {
  try {
   await fs.statAsync(path);
   return true;
  }
  catch(err) {
    return false;
  }
}

export const findGame = toBluebird<string>(async (): Promise<string> => {
  const game = await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]);
  STORE_ID = game.gameStoreId;
  return game.gamePath;
});

export const prepareForModding = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  // skip if BLSE found
  const blseFound = await getPathExistsAsync(path.join(discovery.path, BLSE_EXE));
  if (!blseFound) {
    recommendBLSE(context);
  }

  // If game store not found, location may be set manually - allow setup function to continue.
  const findStoreId = (): Bluebird<string | void> => findGame().catch((_err) => Promise.resolve());
  const startSteam = (): Bluebird<void> => findStoreId().then(() => ((STORE_ID === `steam`)
    ? util.GameStoreHelper.launchGameStore(context.api, STORE_ID, undefined, true)
    : Promise.resolve()));

  // Check if we've already set the load order object for this profile and create it if we haven't.
  return startSteam().finally(() => {
    manager.setStore(STORE_ID);
  });
};
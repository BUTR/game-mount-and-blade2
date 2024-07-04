import { selectors, types } from 'vortex-api';
import { profile } from 'node:console';
import { ICollectionData, ICollectionDataWithGeneralData, ICollectionGeneralData } from './types';
import { genCollectionGeneralLoadOrder, parseCollectionGeneralLoadOrder } from './loadOrder';
import { CollectionParseError } from './errors';
import { GAME_ID } from '../common';
import { hasPersistentBannerlordMods, hasPersistentLoadOrder } from '../vortex';
import { findBLSEMod, forceInstallBLSE, isModActive } from '../blse';
import { vortexToPersistence } from '../loadOrder';
import { VortexLauncherManager } from '../launcher';
import { IBannerlordMod, IBannerlordModStorage, VortexLoadOrderStorage } from '../types';

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const genCollectionGeneralData = (
  profile: types.IProfile,
  loadOrder: VortexLoadOrderStorage,
  includedMods: IBannerlordModStorage
): Promise<ICollectionGeneralData> => {
  const collectionLoadOrder = genCollectionGeneralLoadOrder(loadOrder, Object.values(includedMods));

  const blseMod = findBLSEMod(includedMods);
  const hasBLSE = blseMod !== undefined && isModActive(profile, blseMod);

  return Promise.resolve({
    hasBLSE: hasBLSE,
    suggestedLoadOrder: vortexToPersistence(collectionLoadOrder),
  });
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const parseCollectionGeneralData = async (
  api: types.IExtensionApi,
  collection: ICollectionData
): Promise<void> => {
  if (!hasGeneralData(collection)) {
    return;
  }

  const state = api.getState();
  const profileId: string | undefined = selectors.lastActiveProfileForGame(state, GAME_ID);
  const profile: types.IProfile | undefined = selectors.profileById(state, profileId ?? '');
  if (profile?.gameId !== GAME_ID) {
    const collectionName = collection.info.name !== undefined ? collection.info.name : 'Bannerlord Collection';
    throw new CollectionParseError(collectionName, 'Last active profile is missing');
  }
  const { hasBLSE } = collection;

  const launcherManager = VortexLauncherManager.getInstance(api);
  const modules = launcherManager.getAllModules();
  await parseCollectionGeneralLoadOrder(api, modules, collection);

  if (hasBLSE) {
    await forceInstallBLSE(api);
  }
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const cloneCollectionGeneralData = (
  api: types.IExtensionApi,
  gameId: string,
  collection: ICollectionData,
  from: types.IMod,
  to: types.IMod
): Promise<void> => {
  if (!hasGeneralData(collection)) {
    return Promise.resolve();
  }

  // we don't need to do anything, since it's based on the LO
  return Promise.resolve();
};

const hasGeneralData = (collection: ICollectionData): collection is ICollectionDataWithGeneralData => {
  const collectionData = collection as ICollectionDataWithGeneralData;
  if (!collectionData.hasBLSE) {
    return false;
  }
  if (collectionData.suggestedLoadOrder === undefined) {
    return false;
  }
  return true;
};

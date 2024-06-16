import { selectors, types } from 'vortex-api';
import { GAME_ID } from '../../common';
import { hasPersistentBannerlordMods, hasPersistentLoadOrder } from '../vortex';
import { findBLSEMod, forceInstallBLSE, isModActive } from '../blse';
import { vortexToPersistence } from '../loadOrder';
import { VortexLauncherManager } from '../launcher';
import {
  CollectionParseError,
  genCollectionGeneralLoadOrder,
  ICollectionData,
  ICollectionDataWithGeneralData,
  ICollectionGeneralData,
  parseCollectionGeneralLoadOrder,
} from '.';

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const genCollectionGeneralData = (
  api: types.IExtensionApi,
  includedModIds: string[]
): ICollectionGeneralData => {
  const state = api.getState();

  const profile: types.IProfile | undefined = selectors.activeProfile(state);

  const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile.id] ?? [] : [];
  const mods = hasPersistentBannerlordMods(state.persistent) ? state.persistent.mods.mountandblade2bannerlord : {};

  const includedMods = Object.values(mods).filter((mod) => includedModIds.includes(mod.id));
  const collectionLoadOrder = genCollectionGeneralLoadOrder(loadOrder, includedMods);

  const blseMod = findBLSEMod(state);
  const hasBLSE = blseMod !== undefined && isModActive(profile, blseMod);

  const collectionData: ICollectionGeneralData = {
    hasBLSE: hasBLSE,
    suggestedLoadOrder: vortexToPersistence(collectionLoadOrder),
  };
  return collectionData;
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const parseCollectionGeneralData = async (
  api: types.IExtensionApi,
  collection: ICollectionDataWithGeneralData
): Promise<void> => {
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
  parseCollectionGeneralLoadOrder(api, modules, collection);

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
  collection: ICollectionDataWithGeneralData,
  from: types.IMod,
  to: types.IMod
): void => {
  // we don't need to do anything, since it's based on the LO
};

export const hasGeneralData = (collection: ICollectionData): collection is ICollectionDataWithGeneralData => {
  const collectionData = collection as ICollectionDataWithGeneralData;
  if (!collectionData.hasBLSE) {
    return false;
  }
  if (collectionData.suggestedLoadOrder === undefined) {
    return false;
  }
  return true;
};

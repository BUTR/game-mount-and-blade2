import { selectors, types } from 'vortex-api';
import { GAME_ID } from '../../common';
import { hasPersistentBannerlordMods, hasPersistentLoadOrder } from '../vortex';
import { findBLSEMod, forceInstallBLSE, isModActive } from '../blse';
import { vortexToPersistence } from '../loadOrder';
import { VortexLauncherManager } from '../launcher';
import {
  CollectionParseError,
  genCollectionLoadOrder,
  IBannerlordCollections,
  IBannerlordCollectionsData,
  parseCollectionLoadOrder,
} from '.';

export const genCollectionsData = (api: types.IExtensionApi, includedModIds: string[]) => {
  const state = api.getState();

  const profile = selectors.activeProfile(state);

  const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile.id] ?? [] : [];
  const mods = hasPersistentBannerlordMods(state.persistent) ? state.persistent.mods.mountandblade2bannerlord : {};

  const includedMods = Object.values(mods).filter((mod) => includedModIds.includes(mod.id));
  const collectionLoadOrder = genCollectionLoadOrder(loadOrder, includedMods);

  const blseMod = findBLSEMod(api);
  const hasBLSE = !!blseMod && isModActive(profile, blseMod);

  const collectionData: IBannerlordCollectionsData = {
    hasBLSE: hasBLSE,
    loadOrder: vortexToPersistence(collectionLoadOrder),
  };
  return collectionData;
};

export const parseCollectionsData = async (api: types.IExtensionApi, collection: IBannerlordCollections) => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  const profile = selectors.profileById(state, profileId);
  if (profile?.gameId !== GAME_ID) {
    const collectionName = collection.name !== undefined ? collection.name : 'Bannerlord Collection';
    return Promise.reject(new CollectionParseError(collectionName, 'Last active profile is missing'));
  }
  const { hasBLSE } = collection;

  const launcherManager = VortexLauncherManager.getInstance(api);
  const modules = launcherManager.getAllModules();
  parseCollectionLoadOrder(api, modules, collection);

  if (hasBLSE) {
    await forceInstallBLSE(api);
  }
};

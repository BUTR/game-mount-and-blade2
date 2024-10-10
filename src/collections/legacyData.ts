import { selectors, types } from 'vortex-api';
import { ICollectionData, ICollectionDataWithLegacyData } from './types';
import { CollectionParseError } from './errors';
import { GAME_ID, SUB_MODS_IDS } from '../common';
import { actionsLoadOrder, orderCurrentLoadOrderByExternalLoadOrder } from '../loadOrder';
import { VortexLauncherManager } from '../launcher';
import { PersistenceLoadOrderStorage } from '../types';
import { hasPersistentBannerlordMods } from '../vortex';

export const parseCollectionLegacyData = async (
  api: types.IExtensionApi,
  collection: ICollectionData
): Promise<void> => {
  if (!hasLegacyData(collection)) {
    return;
  }

  await parseLegacyLoadOrder(api, collection);
};

const parseLegacyLoadOrder = async (
  api: types.IExtensionApi,
  collection: ICollectionDataWithLegacyData
): Promise<void> => {
  const state = api.getState();

  const profileId: string | undefined = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    throw new CollectionParseError(collection.info.name ?? '', 'Invalid profile id');
  }

  if (!hasPersistentBannerlordMods(state.persistent)) {
    throw new CollectionParseError(collection.info.name ?? '', 'No mods were found');
  }

  const launcherManager = VortexLauncherManager.getInstance(api);
  const allModules = launcherManager.getAllModules();

  const suggestedLoadOrderEntries = Object.entries(collection.loadOrder);
  const suggestedLoadOrder = suggestedLoadOrderEntries.reduce<PersistenceLoadOrderStorage>((arr, [id, entry]) => {
    if (!allModules[id] && !state.persistent.mods[GAME_ID]?.[id]) {
      return arr;
    }

    const mod = state.persistent.mods[GAME_ID]?.[id];
    const modIds: string[] = mod?.attributes?.[SUB_MODS_IDS] !== undefined ? mod.attributes[SUB_MODS_IDS] ?? [] : [id];
    modIds.forEach((modId) => {
      if (allModules[modId]) {
        arr.push({
          id: modId,
          name: entry.name ?? id,
          isSelected: entry.enabled,
        });
      }
    });
    return arr;
  }, []);

  const loadOrder = await orderCurrentLoadOrderByExternalLoadOrder(api, allModules, suggestedLoadOrder);

  api.store?.dispatch(actionsLoadOrder.setFBLoadOrder(profileId, loadOrder));
};

const hasLegacyData = (collection: ICollectionData): collection is ICollectionDataWithLegacyData => {
  const collectionData = collection as ICollectionDataWithLegacyData;
  if (collectionData.loadOrder === undefined) {
    return false;
  }
  return true;
};

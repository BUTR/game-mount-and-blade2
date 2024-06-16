import { actions, selectors, types } from 'vortex-api';
import { GAME_ID, SUB_MODS_IDS } from '../../common';
import { actionsLoadOrder } from '../loadOrder';
import { VortexLauncherManager } from '../launcher';
import { VortexLoadOrderStorage } from '../../types';
import { hasPersistentBannerlordMods } from '../vortex';
import { CollectionParseError, ICollectionData, ICollectionDataWithLegacyData } from '.';

export const parseCollectionLegacyData = (
  api: types.IExtensionApi,
  collection: ICollectionDataWithLegacyData
): void => {
  parseLegacyLoadOrder(api, collection);
};

const parseLegacyLoadOrder = (api: types.IExtensionApi, collection: ICollectionDataWithLegacyData): void => {
  const state = api.getState();

  const profileId: string | undefined = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    throw new CollectionParseError(collection.info.name || '', 'Invalid profile id');
  }

  if (!hasPersistentBannerlordMods(state.persistent)) {
    throw new CollectionParseError(collection.info.name || '', 'No mods were found');
  }

  const launcherManager = VortexLauncherManager.getInstance(api);
  const modules = launcherManager.getAllModules();

  const vortexLoadOrder = Object.entries(collection.loadOrder)
    .filter(([id]) => {
      return modules[id] || state.persistent.mods[GAME_ID]?.[id];
    })
    .reduce<VortexLoadOrderStorage>((accum, [id, entry]) => {
      const mod = state.persistent.mods[GAME_ID]?.[id];
      const modIds: string[] =
        mod?.attributes?.[SUB_MODS_IDS] !== undefined ? mod.attributes[SUB_MODS_IDS] ?? [] : [id];
      modIds.forEach((modId) => {
        if (modules[modId]) {
          accum.push({
            id: modId,
            name: entry.name ?? id,
            enabled: entry.enabled,
            locked: entry.locked ?? 'false',
            modId: mod?.id ?? undefined!,
            data: entry.data,
          });
        }
      });
      return accum;
    }, []);

  api.store?.dispatch(actions.setLoadOrder(profileId, vortexLoadOrder));
  api.store?.dispatch(actionsLoadOrder.setFBForceUpdate(profileId));
};

export const hasLegacyData = (collection: ICollectionData): collection is ICollectionDataWithLegacyData => {
  const collectionData = collection as ICollectionDataWithLegacyData;
  if (collectionData.loadOrder === undefined) {
    return false;
  }
  return true;
};

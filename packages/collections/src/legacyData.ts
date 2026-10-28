import { actions, selectors, types } from "@nexusmods/vortex-api";
import { ICollectionData, ICollectionDataWithLegacyData } from "./types";
import { CollectionParseError } from "./errors";
import { GAME_ID, SUB_MODS_IDS } from "@bannerlord/core/common";
import { isLockedEntry } from "@bannerlord/core/loadOrder/converters";
import { orderCurrentLoadOrderByExternalLoadOrderAsync } from "@bannerlord/core/loadOrder/utils";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";
import { bselectors } from "@bannerlord/core/selectors";
import {
  IStateWithBannerlord,
  PersistenceLoadOrderStorage,
} from "@bannerlord/core/types";

/**
 * Vortex's first load order API's entry had its position too, see ILoadOrder in the Vortex API
 */
type LegacyLoadOrderEntry = types.ILoadOrderEntry<never> & { pos?: number };

export const parseCollectionLegacyDataAsync = async (
  api: types.IExtensionApi,
  collection: ICollectionData,
): Promise<void> => {
  if (!hasLegacyData(collection)) {
    return;
  }

  await parseLegacyLoadOrderAsync(api, collection);
};

const parseLegacyLoadOrderAsync = async (
  api: types.IExtensionApi,
  collection: ICollectionDataWithLegacyData,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();

  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  if (profileId === undefined) {
    throw new CollectionParseError(
      collection.info.name ?? "",
      "Invalid profile id",
    );
  }

  const mods = bselectors.bannerlordMods(state);
  if (Object.keys(mods).length === 0) {
    throw new CollectionParseError(
      collection.info.name ?? "",
      "No mods were found",
    );
  }

  const launcherManager = VortexLauncherManager.getInstance(api);
  const allModules = await launcherManager.getAllModulesAsync();

  // The old API's entries carry their position, the object's key order isn't the load order
  const suggestedLoadOrderEntries = Object.entries<LegacyLoadOrderEntry>(
    collection.loadOrder,
  ).sort(([, lhs], [, rhs]) =>
    typeof lhs.pos === "number" && typeof rhs.pos === "number"
      ? lhs.pos - rhs.pos
      : 0,
  );
  const suggestedLoadOrder =
    suggestedLoadOrderEntries.reduce<PersistenceLoadOrderStorage>(
      (arr, [id, entry], idx) => {
        if (!allModules[id] && !bselectors.bannerlordModById(state, id)) {
          return arr;
        }

        const mod = bselectors.bannerlordModById(state, id);
        const modIds: string[] =
          mod?.attributes?.[SUB_MODS_IDS] !== undefined
            ? (mod.attributes[SUB_MODS_IDS] ?? [])
            : [id];
        modIds.forEach((modId) => {
          if (allModules[modId]) {
            arr.push({
              id: modId,
              name: entry.name ?? id,
              isSelected: entry.enabled,
              isDisabled: isLockedEntry(entry),
              index: idx,
            });
          }
        });
        return arr;
      },
      [],
    );

  const loadOrder = await orderCurrentLoadOrderByExternalLoadOrderAsync(
    api,
    allModules,
    suggestedLoadOrder,
  );

  api.store?.dispatch(actions.setFBLoadOrder(profileId, loadOrder));
};

const hasLegacyData = (
  collection: ICollectionData,
): collection is ICollectionDataWithLegacyData => {
  const collectionData = collection as ICollectionDataWithLegacyData;
  if (collectionData.loadOrder === undefined) {
    return false;
  }
  return true;
};

import { selectors, types } from "vortex-api";
import { TFunction } from "vortex-api/lib/util/i18n";
import { GAME_ID } from "../common";
import { IBannerlordModStorage, IStateWithBannerlord } from "../types";
import { bselectors } from "../selectors";
import { BannerlordGeneralDataPage, ModOptionsDataPage } from "../views";
import {
  cloneCollectionGeneralDataAsync,
  cloneCollectionModOptionsDataAsync,
  genCollectionGeneralDataAsync,
  genCollectionModOptionsDataAsync,
  hasContextWithCollectionFeature,
  ICollectionData,
  parseCollectionGeneralDataAsync,
  parseCollectionLegacyDataAsync,
  parseCollectionModOptionsDataAsync,
} from "./index";

export const registerCollections = (context: types.IExtensionContext): void => {
  if (!hasContextWithCollectionFeature(context)) {
    return;
  }

  context.optional.registerCollectionFeature(
    /*id:*/ `${GAME_ID}_load_order`,
    /*generate:*/ async (
      gameId: string,
      includedModIds: string[],
      _mod: types.IMod,
    ) => {
      if (GAME_ID !== gameId) {
        return {};
      }

      const state = context.api.getState<IStateWithBannerlord>();

      const profile = selectors.activeProfile(state);
      if (profile === undefined) {
        return {};
      }

      const loadOrder = bselectors.bannerlordLoadOrder(state, profile.id);
      const mods = bselectors.bannerlordMods(state);

      const includedMods = Object.values(mods)
        .filter((mod) => includedModIds.includes(mod.id))
        .reduce<IBannerlordModStorage>((map, obj) => {
          map[obj.id] = obj;
          return map;
        }, {});

      return await genCollectionGeneralDataAsync(
        profile,
        loadOrder,
        includedMods,
      );
    },
    /*parse:*/ async (
      gameId: string,
      collection: ICollectionData,
      _mod: types.IMod,
    ) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await parseCollectionLegacyDataAsync(context.api, collection);
      await parseCollectionGeneralDataAsync(context.api, collection);
    },
    /*clone:*/
    async (
      gameId: string,
      collection: ICollectionData,
      from: types.IMod,
      to: types.IMod,
    ) => {
      if (GAME_ID !== gameId) {
        return;
      }
      await cloneCollectionGeneralDataAsync(
        context.api,
        gameId,
        collection,
        from,
        to,
      );
    },
    /*title:*/ (t: TFunction) => {
      return t(`Requirements & Load Order`);
    },
    /*condition?:*/ (_state: types.IState, gameId: string) => {
      return gameId === GAME_ID;
    },
    /*editComponent?:*/ BannerlordGeneralDataPage,
  );

  context.optional.registerCollectionFeature(
    /*id:*/ `${GAME_ID}_mod_options`,
    /*generate:*/ async (
      gameId: string,
      _includedMods: string[],
      mod: types.IMod,
    ) => {
      if (GAME_ID !== gameId) {
        return {};
      }
      return await genCollectionModOptionsDataAsync(context.api, mod);
    },
    /*parse:*/ async (
      gameId: string,
      collection: ICollectionData,
      mod: types.IMod,
    ) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await parseCollectionModOptionsDataAsync(context.api, collection, mod);
    },
    /*clone:*/ async (
      gameId: string,
      collection: ICollectionData,
      from: types.IMod,
      to: types.IMod,
    ) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await cloneCollectionModOptionsDataAsync(
        context.api,
        gameId,
        collection,
        from,
        to,
      );
    },
    /*title:*/ (t: TFunction) => {
      return t(`Mod Options`);
    },
    /*condition?:*/ (_state: types.IState, gameId: string) => {
      return gameId === GAME_ID;
    },
    /*editComponent?:*/ ModOptionsDataPage,
  );
};

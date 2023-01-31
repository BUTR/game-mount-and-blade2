import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { selectors, types, util } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { getCache } from './subModCache';
import { GAME_ID } from '../common';
import { IMods } from '../types';
import { versionToString } from './util';

const isNonVortexIcon = (context: types.IExtensionContext, subModId: string): boolean => {
    const state = context.api.getState();
    const mods = util.getSafe<IMods>(state, [`persistent`, `mods`, GAME_ID], {});
    const modIds = Object.keys(mods);
    for (const modId of modIds) {
      const subModIds = util.getSafe<string[]>(mods[modId], [`attributes`, `subModIds`], []);
      if (subModIds.includes(subModId)) {
        return false;
      }
    }
    return true;
  };

export const preSort = toBluebird(async (context: types.IExtensionContext, manager: vetypes.VortexExtensionManager, items: types.ILoadOrderDisplayItem[], updateType: types.UpdateType | undefined): Promise<types.ILoadOrderDisplayItem[]> => {
    const state = context.api.store?.getState();
    const activeProfile = selectors.activeProfile(state);
    if (activeProfile?.id === undefined || activeProfile?.gameId !== GAME_ID) {
      // Race condition ?
      return items;
    }
    const CACHE = getCache();
    if (Object.keys(CACHE).length !== items.length) {
      const displayItems = Object.values(CACHE).map<types.ILoadOrderDisplayItem>((iter) => ({
        id: iter.id,
        name: iter.name,
        version: versionToString(iter.version),
        moduleInfo: iter,
        imgUrl: `${__dirname}/gameart.jpg`,
        external: isNonVortexIcon(context, iter.id),
        official: iter.isOfficial,
      }));
      return displayItems;
    }
  
    let ordered = Array<types.ILoadOrderDisplayItem>();
    if (updateType !== `drag-n-drop`) {
      const loadOrder = manager.getLoadOrder();
      ordered = items
        .filter((item) => loadOrder[item.id] !== undefined)
        .sort((lhs, rhs) => loadOrder[lhs.id].pos - loadOrder[rhs.id].pos);
      const unOrdered = items.filter((item) => loadOrder[item.id] === undefined);
      ordered = Array<types.ILoadOrderDisplayItem>().concat(ordered, unOrdered);
    } else {
      ordered = items;
    }
    return ordered;
  });
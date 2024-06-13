import { selectors, types } from 'vortex-api';

type ModIdResult = {
  id: string;
  source: string;
};

/**
 * I have no idea what to do if we have multiple mods that provide the same Module
 */
export const getModIds = (api: types.IExtensionApi, moduleId: string): ModIdResult[] => {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const gameMods = state.persistent.mods[gameId] ?? {};
  const modIds = Object.values(gameMods).reduce<ModIdResult[]>((arr, mod) => {
    if (!mod.attributes || !mod.attributes['subModsIds']) {
      return arr;
    }
    const subModsIds: Set<string> = new Set(mod.attributes['subModsIds']);
    if (subModsIds.has(moduleId)) {
      arr.push({
        id: mod.attributes['modId'],
        source: mod.attributes['source'],
      });
    }

    return arr;
  }, []);

  return modIds;
};

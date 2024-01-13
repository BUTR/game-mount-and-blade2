import { selectors, types } from "vortex-api";

/**
 * I have no idea what to do if we have multiple mods that provide the same Module
 * @param api 
 * @param moduleId 
 * @returns 
 */
export const getModIds = (api: types.IExtensionApi, moduleId: string): string[] => {
    const state = api.getState();
    const gameId = selectors.activeGameId(state);
    const gameMods = state.persistent.mods[gameId] || { };
    const modIds = Object.values(gameMods).reduce<string[]>((arr, mod) => {
        if (!mod.attributes || !mod.attributes.subModsIds) {
            return arr;
        }
        const subModsIds: string[] = mod.attributes.subModsIds;
        if (subModsIds.includes(moduleId)) {
            arr.push(mod.attributes.modId);
        }

        return arr;
    }, [])

    return modIds;
}
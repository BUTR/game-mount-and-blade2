import { IExtensionApi, IState } from "vortex-api/lib/types/api";
import { selectors } from "vortex-api";

/**
 * I have no idea what to do if we have multiple mods that provide the same Module
 * @param api 
 * @param moduleId 
 * @returns 
 */
export const getModIds = (api: IExtensionApi, moduleId: string): string[] => {
    const state: IState | undefined = api.store?.getState();
    if (!state) {
        return [];
    }

    const gameId = selectors.activeGameId(state);
    const gameMods = state.persistent.mods[gameId] || { };
    const modIds = Object.values(gameMods).reduce((arr, mod) => {
        if (!mod.attributes || !mod.attributes.subModsIds) {
            return arr;
        }
        const subModsIds: string[] = mod.attributes.subModsIds;
        if (subModsIds.includes(moduleId)) {
            arr.push(mod.attributes.modId);
        }

        return arr;
    }, [] as string[])

    return modIds;
}
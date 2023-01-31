import { types as vetypes } from "@butr/vortexextensionnative";
import { actions, fs, selectors, types, util } from "vortex-api";
import path from 'path';
import { IExtensionContext } from "vortex-api/lib/types/api";
import { ILoadOrder } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { Dirent } from "../types";

export const registerNativeCallbacks = (context: IExtensionContext, manager: vetypes.VortexExtensionManager) => {
    // Set Native callbacks
    const getActiveProfile = (): types.IProfile => {
        const state = context.api.store?.getState();
        return selectors.activeProfile(state);
    };
    const getProfileById = (id: string): types.IProfile => {
        const state = context.api.store?.getState();
        return selectors.profileById(state, id);
    };
    const getActiveGameId = (): string => {
        const state = context.api.store?.getState();
        return selectors.activeGameId(state);
    };
    const setGameParameters = (gameId: string, executable: string, gameParameters: string[]): void => {
        context.api.store?.dispatch(actions.setGameParameters(gameId, { executable: executable, parameters: gameParameters }));
    };
    const getLoadOrder = (): ILoadOrder => {
        //return getLoadOrderVortex(context);

        const state = context.api.getState();
        const activeProfile = selectors.activeProfile(state);
        if (activeProfile === undefined) {
            return {};
        }
        const loadOrder = util.getSafe<ILoadOrder>(state, [`persistent`, `loadOrder`, activeProfile.id], {});
        if (Array.isArray(loadOrder)) {
            return {};
        }
        return loadOrder;
    };
    const setLoadOrder = (loadOrder: ILoadOrder): void => {
        //setLoadOrderVortex(context, loadOrder);

        if (Array.isArray(loadOrder)) {
            return;
        }
        const state = context.api.store?.getState();
        const activeProfile = selectors.activeProfile(state);
        if (activeProfile === undefined) {
            return;
        }
        context.api.store?.dispatch(actions.setLoadOrder(activeProfile.id, loadOrder as any));
    };
    const translateString = (text: string, ns: string): string => {
        return context.api.translate(text, { ns: ns });
    };
    const sendNotification = (id: string, type: types.NotificationType, message: string, delayMS: number): void => {
        context.api.sendNotification?.({
          id: id,
          type: type,
          message: message,
          displayMS: delayMS,
        });
    };
    const getInstallPath = (): string => {
        const state = context.api.store?.getState();
        const discovery = selectors.currentGameDiscovery(state);
        return discovery.path || "";

        //return util.getSafe(state, ['settings', 'gameMode', 'discovered', GAME_ID], "");
    };
    const readFileContent = (filePath: string): string | null => {
        function removeBom(input: string) {
            // All alternatives found on https://en.wikipedia.org/wiki/Byte_order_mark
            switch (input[0].charCodeAt(0).toString(16)) {
                case 'efbbbf': // UTF-8
                case 'feff': // UTF-16 (BE) + UTF-32 (BE)
                case 'fffe': // UTF-16 (LE)
                case 'fffe0000': // UTF-32 (LE)
                case '2B2F76': // UTF-7
                case 'f7644c': // UTF-1
                case 'dd736673': // UTF-EBCDIC
                case 'efeff': // SCSU
                case 'fbee28': // BOCU-1
                case '84319533': // GB-18030
                  return input.slice(1);
                default: 
                  return input;
              }
        };
        return removeBom(fs.readFileSync(filePath, 'utf8'));
    };
    const readDirectoryFileList = (directoryPath: string): string[] | null => {
        return fs.readdirSync(directoryPath, { withFileTypes: true }).filter((x: Dirent) => x.isFile()).map((x: Dirent) => path.join(directoryPath, x.name));
    };
    const readDirectoryList = (directoryPath: string): string[] | null => {
        return fs.readdirSync(directoryPath, { withFileTypes: true }).filter((x: Dirent) => x.isDirectory()).map((x: Dirent) => path.join(directoryPath, x.name));
    };
    manager.registerCallbacks(
        getActiveProfile,
        getProfileById,
        getActiveGameId,
        setGameParameters,
        getLoadOrder,
        setLoadOrder,
        translateString,
        sendNotification,
        getInstallPath,
        readFileContent,
        readDirectoryFileList,
        readDirectoryList
    );
}
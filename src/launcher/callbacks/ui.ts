import { actions, selectors, types, util } from "vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { GAME_ID } from "../../common";
import { bselectors } from "../../selectors";
import { IStateWithBannerlord } from "../../types";
import { LocalizationManager } from "../../localization";

/**
 * Callback: sets game parameters (CLI args) for discovered tools
 */
export const setGameParametersCallback =
  (api: types.IExtensionApi) =>
  (_executable: string, gameParameters: string[]): Promise<void> => {
    const params = gameParameters
      .filter((x) => x !== " " && x.length > 0)
      .join(" ");

    const state = api.getState();
    const discovery = selectors.currentGameDiscovery(state);
    const cliTools = Object.values(discovery?.tools ?? {}).filter(
      (tool) => tool.id && tool.id.endsWith("-cli"),
    );
    const batchedActions = cliTools.map((tool) =>
      actions.addDiscoveredTool(
        GAME_ID,
        tool.id,
        { ...tool, parameters: [params] },
        true,
      ),
    );
    const gameParamAction = actions.setGameParameters(GAME_ID, {
      parameters: [params],
    });
    util.batchDispatch(api.store?.dispatch, [
      ...batchedActions,
      gameParamAction,
    ]);

    return Promise.resolve();
  };

/**
 * Callback: sends a notification to the user
 */
export const sendNotificationCallback =
  (api: types.IExtensionApi) =>
  (
    id: string,
    type: vetypes.NotificationType,
    message: string,
    delayMS: number,
  ): Promise<void> => {
    switch (type) {
      case "hint":
        api.sendNotification?.({
          id: id,
          type: "activity",
          message: message,
          displayMS: delayMS,
        });
        break;
      case "info":
        api.sendNotification?.({
          id: id,
          type: "info",
          message: message,
          displayMS: delayMS,
        });
        break;
      case "warning":
        api.sendNotification?.({
          id: id,
          type: "warning",
          message: message,
          displayMS: delayMS,
        });
        break;
      case "error":
        api.sendNotification?.({
          id: id,
          type: "error",
          message: message,
          displayMS: delayMS,
        });
        break;
    }

    return Promise.resolve();
  };

/**
 * Callback: shows a dialog to the user
 */
export const sendDialogCallback =
  (api: types.IExtensionApi) =>
  async (
    type: vetypes.DialogType,
    title: string,
    message: string,
    filters: vetypes.FileFilter[],
  ): Promise<string> => {
    const { localize: t } = LocalizationManager.getInstance(api);

    switch (type) {
      case "warning": {
        const messageFull = message.split("--CONTENT-SPLIT--", 2).join("\n");
        const no = t("No");
        const yes = t("Yes");
        const result = await api.showDialog?.(
          "question",
          title,
          { message: messageFull },
          [{ label: no }, { label: yes }],
        );
        switch (result?.action) {
          case yes:
            return "true";
          case no:
            return "false";
          default:
            return "";
        }
      }
      case "fileOpen": {
        const filtersTransformed = filters.map<types.IFileFilter>((x) => ({
          name: x.name,
          extensions: x.extensions,
        }));
        const result = await api.selectFile({
          filters: filtersTransformed,
        });
        return result;
      }
      case "fileSave": {
        const fileName = message;
        const filtersTransformed = filters.map<types.IFileFilter>((x) => ({
          name: x.name,
          extensions: x.extensions,
        }));
        const result = await api.saveFile({
          filters: filtersTransformed,
          defaultPath: fileName,
        });
        return result;
      }
    }
  };

/**
 * Callback: returns the game install path
 */
export const getInstallPathCallback =
  (api: types.IExtensionApi) => (): Promise<string> => {
    const state = api.getState();
    const discovery = selectors.currentGameDiscovery(state);
    const installPath = discovery?.path ?? "";
    return Promise.resolve(installPath);
  };

/**
 * Callback: returns launcher options from Vortex state
 */
export const getOptionsCallback =
  (api: types.IExtensionApi) => (): Promise<vetypes.LauncherOptions> => {
    const state = api.getState<IStateWithBannerlord>();

    const profile = selectors.activeProfile(state);
    if (!profile) {
      return Promise.resolve({
        betaSorting: false,
      });
    }

    const betaSorting =
      bselectors.betaSortingForProfile(state, profile.id) ?? false;

    return Promise.resolve({
      betaSorting: betaSorting,
    });
  };

/**
 * Callback: returns launcher state
 */
export const getStateCallback = (): Promise<vetypes.LauncherState> => {
  return Promise.resolve({
    isSingleplayer: true, // We don't support multiplayer yet
  });
};

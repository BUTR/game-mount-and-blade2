import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { GAME_ID } from "../../common";
import { bselectors } from "../../selectors";
import { IStateWithBannerlord } from "../../types";
import { LocalizationManager } from "../../localization/manager";
import { GameMode } from "../../settings/types";
import { isToolOfGameMode } from "../../vortex/gameModeTools";

const SINGLEPLAYER_ARGUMENT = "/singleplayer";
const MULTIPLAYER_ARGUMENT = "/multiplayer";
const SAVE_ARGUMENTS = ["/continuesave", "/continuegame"];

/**
 * The LauncherManager always starts singleplayer. In multiplayer the mode is swapped and the save arguments dropped,
 * a multiplayer game has no save to continue
 */
const toGameModeParameters = (
  gameParameters: string[],
  gameMode: GameMode,
): string[] =>
  gameMode === "multiplayer"
    ? gameParameters
        .filter(
          (x) => !SAVE_ARGUMENTS.some((argument) => x.startsWith(argument)),
        )
        .map((x) => (x === SINGLEPLAYER_ARGUMENT ? MULTIPLAYER_ARGUMENT : x))
    : gameParameters;

/**
 * Callback: sets game parameters (CLI args) for the game and the active mode's discovered CLI tools.
 * The other mode's tools keep the arguments of their own mode
 */
export const setGameParametersCallback =
  (api: types.IExtensionApi) =>
  (_executable: string, gameParameters: string[]): Promise<void> => {
    const state = api.getState<IStateWithBannerlord>();

    const gameMode = bselectors.activeGameMode(state);

    const params = toGameModeParameters(gameParameters, gameMode)
      .filter((x) => x !== " " && x.length > 0)
      .join(" ");

    const discovery = selectors.currentGameDiscovery(state);
    const cliTools = Object.values(discovery?.tools ?? {}).filter(
      (tool) =>
        tool.id &&
        tool.id.endsWith("-cli") &&
        isToolOfGameMode(tool.id, gameMode),
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
    if (api.store === undefined) {
      return Promise.resolve();
    }
    util.batchDispatch(api.store.dispatch, [
      ...batchedActions,
      gameParamAction,
    ]);

    return Promise.resolve();
  };

const notificationTypeMap: Record<
  vetypes.NotificationType,
  types.NotificationType
> = {
  hint: "activity",
  info: "info",
  warning: "warning",
  error: "error",
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
    api.sendNotification?.({
      id,
      type: notificationTypeMap[type],
      message,
      displayMS: delayMS,
    });

    return Promise.resolve();
  };

const toVortexFileFilters = (
  filters: vetypes.FileFilter[],
): types.IFileFilter[] =>
  filters.map<types.IFileFilter>((x) => ({
    name: x.name,
    extensions: x.extensions,
  }));

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
        return await api.selectFile({
          filters: toVortexFileFilters(filters),
        });
      }
      case "fileSave": {
        return await api.saveFile({
          filters: toVortexFileFilters(filters),
          defaultPath: message,
        });
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
 * Callback: returns launcher state. The LauncherManager orders and lists only the modules of this mode
 */
export const getStateCallback =
  (api: types.IExtensionApi) => (): Promise<vetypes.LauncherState> => {
    const state = api.getState<IStateWithBannerlord>();

    return Promise.resolve({
      isSingleplayer: bselectors.activeGameMode(state) === "singleplayer",
    });
  };

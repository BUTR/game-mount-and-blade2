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

    const tools: Record<string, types.IDiscoveredTool> =
      selectors.discoveryByGame(state, GAME_ID)?.tools ?? {};
    const cliTools = Object.values(tools).filter(
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

let fileDialogExtensions: readonly string[] | undefined;

/**
 * Runs a launcher manager call with its file dialogs offering only the filters for the extensions ("*.bmlist").
 * The launcher manager's dialogs offer every format it handles, this narrows them to the one the user picked
 */
export const withFileDialogExtensionsAsync = async <T>(
  extensions: readonly string[],
  action: () => Promise<T>,
): Promise<T> => {
  fileDialogExtensions = extensions;
  try {
    return await action();
  } finally {
    fileDialogExtensions = undefined;
  }
};

// The launcher manager sends globs ("*.bmlist", "*.*"), Electron's dialogs want bare extensions ("bmlist", "*")
const toVortexFileFilters = (
  filters: vetypes.FileFilter[],
): types.IFileFilter[] =>
  filters
    .filter(
      (x) =>
        fileDialogExtensions === undefined ||
        x.extensions.some((ext) => fileDialogExtensions?.includes(ext)),
    )
    .map<types.IFileFilter>((x) => ({
      name: x.name,
      extensions: x.extensions.map((ext) =>
        ext === "*.*" ? "*" : ext.replace(/^\*?\./, ""),
      ),
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

    // The typings say "fileOpen", the native side sends the enum name lowercased ("fileopen")
    switch (type.toLowerCase()) {
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
      // Cancelling resolves undefined, the launcher manager expects an empty string
      case "fileopen": {
        return (
          (await api.selectFile({
            title: title,
            filters: toVortexFileFilters(filters),
          })) ?? ""
        );
      }
      case "filesave": {
        return (
          (await api.saveFile({
            title: title,
            filters: toVortexFileFilters(filters),
            defaultPath: message,
          })) ?? ""
        );
      }
      // The native side rejects anything but a string
      default:
        return "";
    }
  };

/**
 * Callback: returns the game install path.
 * Bannerlord's own discovery, a read that outlives a switch to another game still needs this game's folder
 */
export const getInstallPathCallback =
  (api: types.IExtensionApi) => (): Promise<string> => {
    const state = api.getState();

    const discovery = selectors.discoveryByGame(state, GAME_ID);
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

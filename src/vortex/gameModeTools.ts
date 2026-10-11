import { actions, selectors, types, util } from "vortex-api";
import { GAME_ID } from "../common";
import { bselectors } from "../selectors";
import { actionsSettings } from "../settings/actions";
import { GameMode } from "../settings/types";
import { IStateWithBannerlord } from "../types";

type DiscoveredTools = Record<string, types.IDiscoveredTool>;
type Actions = Parameters<typeof util.batchDispatch>[1];

/**
 * Each mode's own tools, hidden in the other mode. Tools in neither, like the official launcher with its own mode tabs,
 * are shown in both
 */
const MODE_TOOLS: Record<GameMode, readonly string[]> = {
  singleplayer: [
    "blse-cli",
    "blse-launcher",
    "blse-launcherex",
    "vanilla-cli",
    "bannerlord-sdk",
  ],
  multiplayer: ["vanilla-mp-cli"],
};

const otherGameMode = (gameMode: GameMode): GameMode =>
  gameMode === "multiplayer" ? "singleplayer" : "multiplayer";

/**
 * Whether the tool runs in the mode: either it is one of the mode's tools or it belongs to neither
 */
export const isToolOfGameMode = (toolId: string, gameMode: GameMode): boolean =>
  !MODE_TOOLS[otherGameMode(gameMode)].includes(toolId);

/**
 * Whether Play can launch the tool in the mode. BLSE tools need BLSE installed
 */
const isLaunchable = (
  state: IStateWithBannerlord,
  tools: DiscoveredTools,
  toolId: string,
  gameMode: GameMode,
): boolean =>
  tools[toolId]?.path !== undefined &&
  isToolOfGameMode(toolId, gameMode) &&
  (!toolId.startsWith("blse-") || bselectors.blseMod(state) !== undefined);

const defaultPrimaryTool = (
  state: IStateWithBannerlord,
  tools: DiscoveredTools,
  gameMode: GameMode,
): string | undefined => {
  const toolId = gameMode === "multiplayer" ? "vanilla-mp-cli" : "blse-cli";
  return isLaunchable(state, tools, toolId, gameMode) ? toolId : undefined;
};

/**
 * The mode's remembered primary tool. Until one is remembered the current one is kept if it runs in the mode,
 * otherwise the mode's default is used
 */
const resolvePrimaryTool = (
  state: IStateWithBannerlord,
  tools: DiscoveredTools,
  gameMode: GameMode,
): string | null | undefined => {
  const remembered = bselectors.modePrimaryTool(state, gameMode);
  const candidate =
    remembered !== undefined
      ? remembered
      : bselectors.bannerlordPrimaryTool(state);
  if (candidate === null) {
    return null;
  }
  if (
    candidate !== undefined &&
    isLaunchable(state, tools, candidate, gameMode)
  ) {
    return candidate;
  }
  return defaultPrimaryTool(state, tools, gameMode);
};

/**
 * Remembers the current primary tool for the active mode, before switching away from it
 */
export const rememberPrimaryTool = (api: types.IExtensionApi): void => {
  const state = api.getState<IStateWithBannerlord>();
  const toolId = bselectors.bannerlordPrimaryTool(state);
  const gameMode = bselectors.activeGameMode(state);
  if (
    toolId === undefined ||
    bselectors.modePrimaryTool(state, gameMode) === toolId
  ) {
    return;
  }
  if (toolId !== null && !isToolOfGameMode(toolId, gameMode)) {
    return;
  }
  api.store?.dispatch(actionsSettings.setModePrimaryTool(gameMode, toolId));
};

/**
 * Shows the active mode's tools, hides the other mode's, and makes the mode's primary tool the one Play launches
 */
export const applyGameModeTools = (api: types.IExtensionApi): void => {
  const state = api.getState<IStateWithBannerlord>();
  if (selectors.activeGameId(state) !== GAME_ID) {
    return;
  }

  const tools: DiscoveredTools =
    selectors.discoveryByGame(state, GAME_ID)?.tools ?? {};
  const gameMode = bselectors.activeGameMode(state);
  const hiddenTools = bselectors.modeHiddenTools(state);

  const batched: Actions = [];
  for (const toolId of MODE_TOOLS[otherGameMode(gameMode)]) {
    // Tools the user already hid aren't tracked, so switching back leaves them hidden
    const tool = tools[toolId];
    if (tool !== undefined && tool.hidden !== true) {
      if (tool.custom) {
        // Vortex deletes custom tools instead of hiding them. BLSE's were custom before
        batched.push(
          actions.addDiscoveredTool(
            GAME_ID,
            toolId,
            { ...tool, custom: false },
            false,
          ),
        );
      }
      batched.push(
        actions.setToolVisible(GAME_ID, toolId, false),
        actionsSettings.setModeHiddenTool(toolId, true),
      );
    }
  }
  for (const toolId of MODE_TOOLS[gameMode]) {
    if (hiddenTools[toolId] === true) {
      if (tools[toolId] !== undefined) {
        batched.push(actions.setToolVisible(GAME_ID, toolId, true));
      }
      batched.push(actionsSettings.setModeHiddenTool(toolId, false));
    }
  }

  const primaryTool = resolvePrimaryTool(state, tools, gameMode);
  if (primaryTool !== bselectors.bannerlordPrimaryTool(state)) {
    // Vortex's own "launch the game" choice is null, so it is passed as is
    batched.push(actions.setPrimaryTool(GAME_ID, primaryTool as string));
  }

  if (batched.length > 0) {
    util.batchDispatch(api.store?.dispatch, batched);
  }
};

/**
 * Remembers the primary tool picked for the active mode. When Vortex picks another mode's tool,
 * as it does with BLSE's defaultPrimary once the primary tool is unset, the mode's own is restored
 */
export const watchPrimaryTool = (api: types.IExtensionApi): void => {
  api.onStateChange?.(
    ["settings", "interface", "primaryTool", GAME_ID],
    (_previous, current) => {
      const state = api.getState<IStateWithBannerlord>();
      if (selectors.activeGameId(state) !== GAME_ID) {
        return;
      }

      const toolId = current as string | null | undefined;
      if (toolId === undefined) {
        return;
      }
      const gameMode = bselectors.activeGameMode(state);
      if (toolId !== null && !isToolOfGameMode(toolId, gameMode)) {
        applyGameModeTools(api);
        return;
      }
      if (bselectors.modePrimaryTool(state, gameMode) !== toolId) {
        api.store?.dispatch(
          actionsSettings.setModePrimaryTool(gameMode, toolId),
        );
      }
    },
  );
};

import { actions, types } from "vortex-api";
import { GAME_ID } from "../common";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";

/**
 * BLSE is a singleplayer tool, so the primary tool is only managed in the singleplayer mode.
 * The multiplayer mode's primary tool is managed by the game mode tools
 */
export const didDeployBLSEAsync = (api: types.IExtensionApi): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  if (bselectors.activeGameMode(state) !== "singleplayer") {
    return Promise.resolve();
  }

  const primaryTool = bselectors.bannerlordPrimaryTool(state);

  const currentBlseMod = bselectors.blseMod(state);
  if (currentBlseMod && primaryTool === undefined) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, "blse-cli"));
  }
  if (!currentBlseMod && primaryTool === "blse-cli") {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

/**
 * Event function, be careful
 */
export const didPurgeBLSEAsync = (api: types.IExtensionApi): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  if (bselectors.activeGameMode(state) !== "singleplayer") {
    return Promise.resolve();
  }

  const primaryTool = bselectors.bannerlordPrimaryTool(state);
  if (primaryTool !== "blse-cli") {
    return Promise.resolve();
  }

  const currentBlseMod = bselectors.blseMod(state);
  if (currentBlseMod) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

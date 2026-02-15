import { actions, types } from "vortex-api";
import { findBLSEMod } from "./utils";
import { GAME_ID } from "../common";
import { IStateWithBannerlord } from "../types";

export const didDeployBLSEAsync = (api: types.IExtensionApi): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();

  const primaryTool =
    state.settings.interface.primaryTool?.mountandblade2bannerlord;

  const mods = state.persistent.mods?.mountandblade2bannerlord ?? {};
  const blseMod = findBLSEMod(mods);
  if (blseMod && primaryTool === undefined) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, "blse-cli"));
  }
  if (!blseMod && primaryTool === "blse-cli") {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

/**
 * Event function, be careful
 */
export const didPurgeBLSEAsync = (api: types.IExtensionApi): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();

  const primaryTool =
    state.settings.interface.primaryTool?.mountandblade2bannerlord;
  if (primaryTool !== "blse-cli") {
    return Promise.resolve();
  }

  const mods = state.persistent.mods?.mountandblade2bannerlord ?? {};
  const blseMod = findBLSEMod(mods);
  if (blseMod) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

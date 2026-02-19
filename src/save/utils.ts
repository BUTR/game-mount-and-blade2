import { selectors, types } from "vortex-api";
import { actionsSave } from "./actions";
import { VortexLauncherManager } from "../launcher";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";

export const reloadSaveAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();

  const profile = selectors.activeProfile(state);
  if (!profile) {
    throw new Error(`Active profile is undefined`);
  }
  const save = bselectors.saveNameForProfile(state, profile.id);

  api.store?.dispatch(actionsSave.setCurrentSave(profile.id, save));

  const launcherManager = VortexLauncherManager.getInstance(api);
  await launcherManager.setSaveFileAsync(save ?? "");
};

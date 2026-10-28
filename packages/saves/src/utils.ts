import { selectors, types } from "@nexusmods/vortex-api";
import { actionsSave } from "./actions";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";
import { savesSelectors } from "./selectors";
import { IStateWithSaves } from "./types";

export const reloadSaveAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const state = api.getState<IStateWithSaves>();

  const profile = selectors.activeProfile(state);
  if (!profile) {
    throw new Error(`Active profile is undefined`);
  }
  const save = savesSelectors.saveNameForProfile(state, profile.id);

  api.store?.dispatch(actionsSave.setCurrentSave(profile.id, save));

  const launcherManager = VortexLauncherManager.getInstance(api);
  await launcherManager.setSaveFileAsync(save ?? "");
};

import { types } from "@nexusmods/vortex-api";
import { actionsSave } from "./actions";
import { ISavesSettings } from "./types";
import { actionsSettings } from "@bannerlord/core/settings/actions";
import { createReducer, updateAuto } from "@bannerlord/core/store/redux";

export const savesSettingsDefaults: ISavesSettings = {
  saveName: {},
};

// Vortex API's IReducerSpec.reducers uses `any` for payload type, so we must match it
export const savesSettingsReducers: types.IReducerSpec<ISavesSettings>["reducers"] =
  {};

createReducer(
  actionsSave.setCurrentSave,
  (state, payload) => {
    const { profileId, saveId } = payload;

    return updateAuto(state, {
      saveName: { $auto: { [profileId]: { $set: saveId } } },
    });
  },
  savesSettingsReducers,
);

createReducer(
  actionsSettings.removeProfileSettings,
  (state, payload) => {
    const { profileId } = payload;
    const { [profileId]: _removed, ...saveName } = state.saveName ?? {};

    return { ...state, saveName };
  },
  savesSettingsReducers,
);

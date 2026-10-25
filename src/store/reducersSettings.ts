import { actions, types } from "@nexusmods/vortex-api";
import { Utils } from "@butr/vortexextensionnative";
import {
  createReducer,
  mergeReducers,
  updateAuto,
} from "@bannerlord/core/store/redux";
import { actionsSettings } from "@bannerlord/core/settings/actions";
import { IBannerlordSettings } from "@bannerlord/core/settings/types";
import { languageMap } from "@bannerlord/core/localization/utils";
import {
  savesSettingsDefaults,
  savesSettingsReducers,
} from "@bannerlord/saves/reducers";
import { ISavesSettings } from "@bannerlord/saves/types";
import {
  serversSettingsDefaults,
  serversSettingsReducers,
} from "@bannerlord/servers/reducers";
import { IServersSettings } from "@bannerlord/servers/types";

const defaults: IBannerlordSettings = {
  sortOnDeploy: {},
  fixCommonIssues: {},
  betaSorting: {},
};

// Vortex API's IReducerSpec.reducers uses `any` for payload type, so we must match it
const reducers: types.IReducerSpec<IBannerlordSettings>["reducers"] = {};

createReducer(
  actionsSettings.setSortOnDeploy,
  (state, payload) => {
    const { profileId, sort } = payload;

    return updateAuto(state, {
      sortOnDeploy: { $auto: { [profileId]: { $set: sort } } },
    });
  },
  reducers,
);

createReducer(
  actionsSettings.setFixCommonIssues,
  (state, payload) => {
    const { profileId, fixCommonIssues } = payload;

    return updateAuto(state, {
      fixCommonIssues: { $auto: { [profileId]: { $set: fixCommonIssues } } },
    });
  },
  reducers,
);

createReducer(
  actionsSettings.setBetaSorting,
  (state, payload) => {
    const { profileId, betaSorting } = payload;

    return updateAuto(state, {
      betaSorting: { $auto: { [profileId]: { $set: betaSorting } } },
    });
  },
  reducers,
);

createReducer(
  actionsSettings.setModePrimaryTool,
  (state, payload) => {
    const { gameMode, toolId } = payload;

    return updateAuto(state, {
      modePrimaryTool: { $auto: { [gameMode]: { $set: toolId } } },
    });
  },
  reducers,
);

createReducer(
  actionsSettings.setModeHiddenTool,
  (state, payload) => {
    const { toolId, hidden } = payload;

    if (hidden) {
      return updateAuto(state, {
        modeHiddenTools: { $auto: { [toolId]: { $set: true } } },
      });
    }
    const { [toolId]: _removed, ...rest } = state.modeHiddenTools ?? {};
    return { ...state, modeHiddenTools: rest };
  },
  reducers,
);

createReducer(
  actionsSettings.removeProfileSettings,
  (state, payload) => {
    const { profileId } = payload;
    const without = <T>(record: Record<string, T>): Record<string, T> => {
      const { [profileId]: _removed, ...rest } = record;
      return rest;
    };

    return {
      ...state,
      sortOnDeploy: without(state.sortOnDeploy ?? {}),
      fixCommonIssues: without(state.fixCommonIssues ?? {}),
      betaSorting: without(state.betaSorting ?? {}),
    };
  },
  reducers,
);

createReducer(
  actions.setLoadOrder,
  (state, payload) => {
    const { id, order } = payload;

    return updateAuto(state, { [id]: { $set: order } });
  },
  reducers,
);

createReducer(
  actions.setLanguage,
  (state, payload: string) => {
    Utils.setLanguage(languageMap.getNameFromCode(payload));
    return state;
  },
  reducers,
);

// The Saves and Servers pages keep their settings next to these, Vortex persists them together
const reducer: types.IReducerSpec<
  IBannerlordSettings & ISavesSettings & IServersSettings
> = {
  reducers: mergeReducers(
    reducers,
    savesSettingsReducers,
    serversSettingsReducers,
  ),
  defaults: {
    ...defaults,
    ...savesSettingsDefaults,
    ...serversSettingsDefaults,
  },
};

// Needed because the API expects the generic IReducerSpec
export const reducerSettings = reducer as unknown as types.IReducerSpec;

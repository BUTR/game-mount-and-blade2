import { actions, types } from "vortex-api";
import { Utils } from "@butr/vortexextensionnative";
import { createReducer, updateAuto } from "./redux";
import { actionsSave } from "../save/actions";
import { actionsServers } from "../servers/actions";
import { actionsSettings } from "../settings/actions";
import { IBannerlordSettings } from "../settings/types";
import { languageMap } from "../localization/utils";

const defaults: IBannerlordSettings = {
  sortOnDeploy: {},
  fixCommonIssues: {},
  saveName: {},
  betaSorting: {},
  servers: {},
  favoriteServers: {},
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
      saveName: without(state.saveName ?? {}),
      sortOnDeploy: without(state.sortOnDeploy ?? {}),
      fixCommonIssues: without(state.fixCommonIssues ?? {}),
      betaSorting: without(state.betaSorting ?? {}),
    };
  },
  reducers,
);

createReducer(
  actionsSave.setCurrentSave,
  (state, payload) => {
    const { profileId, saveId } = payload;

    return updateAuto(state, {
      saveName: { $auto: { [profileId]: { $set: saveId } } },
    });
  },
  reducers,
);

createReducer(
  actionsServers.addServer,
  (state, payload) => {
    return updateAuto(state, {
      servers: { $auto: { [payload.id]: { $set: payload } } },
    });
  },
  reducers,
);

createReducer(
  actionsServers.setServerFavorite,
  (state, payload) => {
    const { serverId, favorite } = payload;

    return updateAuto(
      state,
      favorite
        ? { favoriteServers: { $auto: { [serverId]: { $set: true } } } }
        : { favoriteServers: { $auto: { $unset: [serverId] } } },
    );
  },
  reducers,
);

createReducer(
  actionsServers.setServerFilters,
  (state, payload) => updateAuto(state, { serverFilters: { $set: payload } }),
  reducers,
);

createReducer(
  actionsServers.removeServer,
  (state, payload) => {
    const { serverId } = payload;

    return updateAuto(state, {
      servers: { $auto: { $unset: [serverId] } },
    });
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

const reducer: types.IReducerSpec<IBannerlordSettings> = {
  reducers,
  defaults,
};

// Needed because the API expects the generic IReducerSpec
export const reducerSettings = reducer as unknown as types.IReducerSpec;

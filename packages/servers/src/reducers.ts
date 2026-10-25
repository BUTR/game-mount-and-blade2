import { types } from "@nexusmods/vortex-api";
import { actionsServers } from "./actions";
import { IServersSettings } from "./types";
import { createReducer, updateAuto } from "@bannerlord/core/store/redux";

export const serversSettingsDefaults: IServersSettings = {
  servers: {},
  favoriteServers: {},
};

// Vortex API's IReducerSpec.reducers uses `any` for payload type, so we must match it
export const serversSettingsReducers: types.IReducerSpec<IServersSettings>["reducers"] =
  {};

createReducer(
  actionsServers.addServer,
  (state, payload) => {
    return updateAuto(state, {
      servers: { $auto: { [payload.id]: { $set: payload } } },
    });
  },
  serversSettingsReducers,
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
  serversSettingsReducers,
);

createReducer(
  actionsServers.setServerFilters,
  (state, payload) => updateAuto(state, { serverFilters: { $set: payload } }),
  serversSettingsReducers,
);

createReducer(
  actionsServers.removeServer,
  (state, payload) => {
    const { serverId } = payload;

    return updateAuto(state, {
      servers: { $auto: { $unset: [serverId] } },
    });
  },
  serversSettingsReducers,
);

import { createAction } from "redux-act";
import { IServerEntry, IServerFilters } from "./types";
import { EXTENSION_BASE_ID } from "@bannerlord/core/common";

const addServer = createAction(
  `${EXTENSION_BASE_ID}_ADD_SERVER`,
  (server: IServerEntry) => server,
);

const removeServer = createAction(
  `${EXTENSION_BASE_ID}_REMOVE_SERVER`,
  (serverId: string) => ({
    serverId,
  }),
);

/**
 * Toggles favorite status for a server by its canonical ID (`host:port`).
 */
const setServerFavorite = createAction(
  `${EXTENSION_BASE_ID}_SET_SERVER_FAVORITE`,
  (serverId: string, favorite: boolean) => ({
    serverId,
    favorite,
  }),
);

const setServerFilters = createAction(
  `${EXTENSION_BASE_ID}_SET_SERVER_FILTERS`,
  (filters: IServerFilters) => filters,
);

export const actionsServers = {
  addServer,
  removeServer,
  setServerFavorite,
  setServerFilters,
};

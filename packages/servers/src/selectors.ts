import { GAME_ID } from "@bannerlord/core/common";
import {
  DEFAULT_SERVER_FILTERS,
  IServerEntry,
  IServerFilters,
  IStateWithServers,
} from "./types";

const NO_SERVERS: Record<string, IServerEntry> = {};

const servers = (state: IStateWithServers): Record<string, IServerEntry> =>
  state.settings[GAME_ID]?.servers ?? NO_SERVERS;

const NO_FAVORITE_SERVERS: Record<string, true> = {};

const favoriteServers = (state: IStateWithServers): Record<string, true> =>
  state.settings[GAME_ID]?.favoriteServers ?? NO_FAVORITE_SERVERS;

// Filters saved by older versions may omit newly introduced filter options, so they are merged onto default values.
// Merged conditionally by reference identity to preserve selector memoization and avoid returning new object references on every read.
let storedServerFilters: IServerFilters | undefined;
let mergedServerFilters: IServerFilters = DEFAULT_SERVER_FILTERS;
const serverFilters = (state: IStateWithServers): IServerFilters => {
  const stored = state.settings[GAME_ID]?.serverFilters;
  if (stored === undefined) {
    return DEFAULT_SERVER_FILTERS;
  }
  if (stored !== storedServerFilters) {
    storedServerFilters = stored;
    mergedServerFilters = { ...DEFAULT_SERVER_FILTERS, ...stored };
  }
  return mergedServerFilters;
};

export const serversSelectors = {
  servers,
  favoriteServers,
  serverFilters,
};

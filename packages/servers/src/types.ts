import { GAME_ID } from "@bannerlord/core/common";
import { IStateWithBannerlord } from "@bannerlord/core/types";
import { IServerAddress } from "@bannerlord/server-query/address";

/**
 * Dedicated server manually added to the server browser by the user.
 */
export interface IServerEntry extends IServerAddress {
  id: string;
  addedAt: number;
}

/**
 * Persistent filter criteria applied on the Servers page.
 * Conditions are combined conjunctively (AND) to narrow the displayed server list.
 */
export interface IServerFilters {
  favorites: boolean;
  hasPlayers: boolean;
  notFull: boolean;
  noPassword: boolean;
  community: boolean;
  readyWithMyMods: boolean;
  noModsNeeded: boolean;
  /**
   * Game types to include in results, or empty to display all game types.
   */
  modes: string[];
}

export const DEFAULT_SERVER_FILTERS: IServerFilters = {
  favorites: false,
  hasPlayers: false,
  notFull: false,
  noPassword: false,
  community: false,
  readyWithMyMods: false,
  noModsNeeded: false,
  modes: [],
};

/**
 * The Servers page's part of the extension's settings
 */
export interface IServersSettings {
  servers: Record<string, IServerEntry>;
  /**
   * Starred servers by server id (host:port)
   */
  favoriteServers: Record<string, true>;
  /**
   * The Servers page's filters, missing until they are first changed
   */
  serverFilters?: IServerFilters;
}

export interface IStateWithServers extends IStateWithBannerlord {
  settings: IStateWithBannerlord["settings"] & {
    [GAME_ID]?: IServersSettings;
  };
}

import { IServerAddress } from "./address";

/**
 * Map entry returned by the vanilla dedicated server `GET /maps/list` endpoint.
 */
export interface IServerMap {
  name: string;
  uniqueToken: string | null;
  revision: string | null;
}

/**
 * Response payload returned by the vanilla dedicated server `GET /maps/list` endpoint.
 */
export interface IServerMapList {
  currentlyPlaying: string | null;
  maps: IServerMap[];
}

export type ServerQueryState = "pending" | "online" | "unreachable" | "invalid";

export interface IServerQueryResult {
  state: ServerQueryState;
  /**
   * Responding endpoint address (either the public address or local loopback fallback for self-hosted servers); null until queried.
   */
  endpoint: IServerAddress | null;
  /**
   * Indicates whether the query utilized lobby server metadata to verify loopback fallbacks for locally hosted servers.
   */
  withLobby: boolean;
  responseTimeMs: number | null;
  mapList: IServerMapList | null;
  error: string | null;
  checkedAt: number | null;
}

import type { IServerExtensionResult } from "./extension";
import type { ILobbyServer, IServerPing } from "./lobby";
import type { IServerEntry, IServerQueryResult } from "./types";

/**
 * Consolidated server row representing a lobby-listed server, a manually added server, or a merged entry of both.
 */
export interface IServerRow {
  id: string;
  address: string;
  port: number;
  manual: IServerEntry | null;
  lobby: ILobbyServer | null;
  probe: IServerQueryResult | null;
  extension: IServerExtensionResult | null;
  /**
   * Measured round-trip latency (ICMP, TCP fallback, or route hop estimate).
   * Null if unreachable across probe methods; undefined if not yet pinged.
   */
  ping?: IServerPing | null | undefined;
  /**
   * True if the currently active profile is specifically tied to this server, pinning it to the top.
   */
  pinned: boolean;
  /**
   * True if marked as a favorite by the user.
   */
  favorite: boolean;
}

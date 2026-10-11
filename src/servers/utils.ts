import { IServerEntry, IServerQueryResult } from "./types";

/**
 * Default port used by most dedicated servers.
 * The embedded HTTP server providing map listings listens on the same TCP port as the game server.
 */
export const DEFAULT_SERVER_PORT = 7210;

const HOSTNAME_PATTERN = /^[A-Za-z0-9.-]+$/;
const IPV6_PATTERN = /^[0-9A-Fa-f:.]+$/;

export interface IServerAddress {
  address: string;
  port: number;
}

/**
 * Parses address strings in `host`, `host:port`, `[ipv6]`, or `[ipv6]:port` format.
 */
export const parseServerAddress = (input: string): IServerAddress | null => {
  const value = input.trim();
  if (value.length === 0) {
    return null;
  }

  let address: string;
  let portText: string | undefined;

  const ipv6Match = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
  if (ipv6Match) {
    address = ipv6Match[1]!;
    portText = ipv6Match[2];
    if (!IPV6_PATTERN.test(address)) {
      return null;
    }
  } else {
    const parts = value.split(":");
    if (parts.length > 2) {
      return null;
    }
    address = parts[0]!;
    portText = parts[1];
    if (!HOSTNAME_PATTERN.test(address)) {
      return null;
    }
  }

  if (portText === undefined) {
    return { address, port: DEFAULT_SERVER_PORT };
  }

  if (!/^\d+$/.test(portText)) {
    return null;
  }
  const port = Number(portText);
  if (port < 1 || port > 65535) {
    return null;
  }

  return { address, port };
};

export const formatServerAddress = (
  server: Pick<IServerEntry, "address" | "port">,
): string =>
  server.address.includes(":")
    ? `[${server.address}]:${server.port}`
    : `${server.address}:${server.port}`;

export const getServerId = (server: IServerAddress): string =>
  formatServerAddress(server).toLowerCase();

export const createPendingResult = (): IServerQueryResult => ({
  state: "pending",
  endpoint: null,
  withLobby: false,
  responseTimeMs: null,
  mapList: null,
  error: null,
  checkedAt: null,
});

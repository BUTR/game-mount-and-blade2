import {
  getFromServerAsync,
  isRecord,
  parseJsonBody,
  ServerHttpResult,
} from "./http";
import {
  IServerEntry,
  IServerMap,
  IServerMapList,
  IServerQueryResult,
} from "./types";

const asStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Parses the payload from `GET /maps/list`, served anonymously by vanilla dedicated servers
 * (`TaleWorlds.MountAndBlade.ListedServer.MapServer`).
 */
export const parseMapList = (text: string): IServerMapList => {
  const parsed = parseJsonBody(text);
  if (!isRecord(parsed) || !Array.isArray(parsed["maps"])) {
    throw new Error("The response is not a Bannerlord map list");
  }

  const maps: IServerMap[] = parsed["maps"]
    .filter(isRecord)
    .filter((map) => typeof map["name"] === "string")
    .map((map) => ({
      name: map["name"] as string,
      uniqueToken: asStringOrNull(map["uniqueToken"]),
      revision: asStringOrNull(map["revision"]),
    }));

  return {
    currentlyPlaying: asStringOrNull(parsed["currentlyPlaying"]),
    maps,
  };
};

const toQueryResult = (
  server: Pick<IServerEntry, "address" | "port">,
  response: ServerHttpResult,
): IServerQueryResult => {
  const checkedAt = Date.now();
  const endpoint = { address: server.address, port: server.port };
  const withLobby = false;
  switch (response.kind) {
    case "failed":
      return {
        // If an error occurred after receiving an initial response, mark as 'invalid' rather than 'unreachable'.
        state: response.responseTimeMs === null ? "unreachable" : "invalid",
        endpoint,
        withLobby,
        responseTimeMs: response.responseTimeMs,
        mapList: null,
        error: response.error,
        checkedAt,
      };
    case "status":
      return {
        state: "invalid",
        endpoint,
        withLobby,
        responseTimeMs: response.responseTimeMs,
        mapList: null,
        error: `The server responded with HTTP ${response.statusCode}`,
        checkedAt,
      };
    case "ok":
      try {
        return {
          state: "online",
          endpoint,
          withLobby,
          responseTimeMs: response.responseTimeMs,
          mapList: parseMapList(response.body),
          error: null,
          checkedAt,
        };
      } catch (err) {
        return {
          state: "invalid",
          endpoint,
          withLobby,
          responseTimeMs: response.responseTimeMs,
          mapList: null,
          error: err instanceof Error ? err.message : String(err),
          checkedAt,
        };
      }
  }
};

/**
 * Queries the map list endpoint of a dedicated server. Never rejects.
 */
export const queryServerAsync = async (
  server: Pick<IServerEntry, "address" | "port">,
): Promise<IServerQueryResult> =>
  toQueryResult(server, await getFromServerAsync(server, "/maps/list"));

const LOOPBACK_ADDRESS = "127.0.0.1";

/**
 * Queries a lobby-listed server with loopback fallback.
 * A locally hosted server is advertised by the lobby with its public IP address, which consumer routers
 * frequently fail to route back locally (lack of NAT loopback / hairpinning).
 * If the public endpoint is unreachable, this queries `127.0.0.1` on the same port and accepts the local
 * response only if its active map matches the lobby listing. Never rejects.
 */
export const queryLobbyServerAsync = async (
  server: Pick<IServerEntry, "address" | "port">,
  lobbyMap: string,
): Promise<IServerQueryResult> => {
  const result = {
    ...(await queryServerAsync(server)),
    withLobby: true,
  };
  if (result.state !== "unreachable" || server.address === LOOPBACK_ADDRESS) {
    return result;
  }
  const local = await queryServerAsync({
    address: LOOPBACK_ADDRESS,
    port: server.port,
  });
  return local.state === "online" &&
    local.mapList?.currentlyPlaying === lobbyMap
    ? { ...local, withLobby: true }
    : result;
};

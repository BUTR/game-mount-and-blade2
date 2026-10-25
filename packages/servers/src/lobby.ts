import { log, selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import {
  fetchLobbyServersAsync as fetchServersAsync,
  getLobbyPlatform,
  ILobbyBridgeOptions,
  ILobbyServerList,
  LobbyError,
  pingServersAsync as pingAsync,
  ServerPings,
} from "@bannerlord/lobby";
import { IServerAddress } from "@bannerlord/server-query/address";

// The bridge is published next to the extension's bundle
const bridgeOptions: ILobbyBridgeOptions = { bridgeFolder: __dirname, log };

let lastServerList: ILobbyServerList | null = null;

/**
 * Caches the most recent server list fetched during this Vortex session so the view preserves state when reopened.
 */
export const getLastLobbyServerList = (): ILobbyServerList | null =>
  lastServerList;

// Active fetch request shared by concurrent callers to prevent redundant simultaneous lobby logins.
let inFlight: Promise<ILobbyServerList> | null = null;

/**
 * Fetches the list of custom servers from the lobby via the bridge. Concurrent calls share the in-flight request.
 */
export const fetchLobbyServersAsync = (
  api: types.IExtensionApi,
): Promise<ILobbyServerList> => {
  inFlight ??= fetchLobbyServersOnceAsync(api).finally(() => {
    inFlight = null;
  });
  return inFlight;
};

const fetchLobbyServersOnceAsync = async (
  api: types.IExtensionApi,
): Promise<ILobbyServerList> => {
  const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
  if (!discovery?.path) {
    throw new LobbyError("Bannerlord has not been discovered yet");
  }

  // Before asking for the runtime, a store the bridge can't sign in with doesn't need it
  getLobbyPlatform(discovery.store);

  // Ensure the .NET 9 Desktop Runtime is available; the bridge runs on it through the dotnet host.
  await api.ext?.["awaitDotnetAssert"]?.();

  lastServerList = await fetchServersAsync(
    { gamePath: discovery.path, store: discovery.store },
    bridgeOptions,
  );
  return lastServerList;
};

/**
 * Measures latency to servers the way the game's server list does, through the bridge. Never rejects.
 */
export const pingServersAsync = async (
  api: types.IExtensionApi,
  servers: IServerAddress[],
): Promise<ServerPings> => {
  if (servers.length > 0) {
    await api.ext?.["awaitDotnetAssert"]?.();
  }
  return await pingAsync(servers, bridgeOptions);
};

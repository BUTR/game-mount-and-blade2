import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { selectors, types } from "@nexusmods/vortex-api";
import {
  fetchLobbyServersAsync as fetchFromBridgeAsync,
  ILobbyServerList,
  LobbyError,
  pingServersAsync as pingFromBridgeAsync,
} from "@bannerlord/lobby";
import {
  fetchLobbyServersAsync,
  getLastLobbyServerList,
  pingServersAsync,
} from "./lobby";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  selectors: { discoveryByGame: vi.fn() },
}));

vi.mock("@bannerlord/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bannerlord/lobby")>()),
  fetchLobbyServersAsync: vi.fn(),
  pingServersAsync: vi.fn(async () => ({})),
}));

const list = (fetchedAt: number): ILobbyServerList => ({
  platform: "steam",
  applicationVersion: "v1.2.12.0",
  servers: [],
  fetchedAt,
});

const apiWith = (awaitDotnetAssert = vi.fn(async () => undefined)) => ({
  api: {
    getState: () => ({}),
    ext: { awaitDotnetAssert },
  } as unknown as types.IExtensionApi,
  awaitDotnetAssert,
});

const discover = (discovery: { path?: string; store?: string } | undefined) =>
  vi
    .mocked(selectors.discoveryByGame)
    .mockReturnValue(discovery as ReturnType<typeof selectors.discoveryByGame>);

beforeEach(() => {
  vi.mocked(fetchFromBridgeAsync).mockReset();
  vi.mocked(pingFromBridgeAsync).mockClear();
  discover({ path: "C:\\Games\\Bannerlord", store: "steam" });
});

describe("fetchLobbyServersAsync", () => {
  it("needs the game to be discovered", async () => {
    discover(undefined);
    const { api } = apiWith();

    await expect(fetchLobbyServersAsync(api)).rejects.toBeInstanceOf(
      LobbyError,
    );
    expect(fetchFromBridgeAsync).not.toHaveBeenCalled();
  });

  it("refuses a store the bridge can't sign in with before asking for .NET", async () => {
    discover({ path: "C:\\Games\\Bannerlord", store: "xbox" });
    const { api, awaitDotnetAssert } = apiWith();

    await expect(fetchLobbyServersAsync(api)).rejects.toBeInstanceOf(
      LobbyError,
    );
    expect(awaitDotnetAssert).not.toHaveBeenCalled();
  });

  it("makes sure .NET is there, then asks the bridge for the game's servers", async () => {
    const order: string[] = [];
    const { api } = apiWith(
      vi.fn(async () => {
        order.push("dotnet");
      }),
    );
    vi.mocked(fetchFromBridgeAsync).mockImplementation(async () => {
      order.push("bridge");
      return list(1);
    });

    await expect(fetchLobbyServersAsync(api)).resolves.toEqual(list(1));

    expect(order).toEqual(["dotnet", "bridge"]);
    expect(fetchFromBridgeAsync).toHaveBeenCalledWith(
      {
        gamePath: "C:\\Games\\Bannerlord",
        binaryPath: path.join("bin", "Win64_Shipping_Client"),
        store: "steam",
      },
      expect.objectContaining({ bridgeFolder: expect.any(String) }),
    );
    expect(getLastLobbyServerList()).toEqual(list(1));
  });

  it("shares one bridge request between concurrent callers, then fetches anew", async () => {
    const { api } = apiWith();
    let finish: (value: ILobbyServerList) => void = () => undefined;
    vi.mocked(fetchFromBridgeAsync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.mocked(fetchFromBridgeAsync).mockResolvedValueOnce(list(3));

    const first = fetchLobbyServersAsync(api);
    const second = fetchLobbyServersAsync(api);
    await vi.waitFor(() => expect(fetchFromBridgeAsync).toHaveBeenCalled());
    finish(list(2));

    expect(await first).toEqual(list(2));
    expect(await second).toEqual(list(2));
    expect(fetchFromBridgeAsync).toHaveBeenCalledTimes(1);

    expect(await fetchLobbyServersAsync(api)).toEqual(list(3));
    expect(fetchFromBridgeAsync).toHaveBeenCalledTimes(2);
  });

  it("lets the next call try again after a failure", async () => {
    const { api } = apiWith();
    vi.mocked(fetchFromBridgeAsync).mockRejectedValueOnce(
      new LobbyError("Steam is not running"),
    );
    vi.mocked(fetchFromBridgeAsync).mockResolvedValueOnce(list(4));

    await expect(fetchLobbyServersAsync(api)).rejects.toThrow(
      "Steam is not running",
    );
    await expect(fetchLobbyServersAsync(api)).resolves.toEqual(list(4));
  });
});

describe("pingServersAsync", () => {
  it("doesn't ask for .NET without servers to ping", async () => {
    const { api, awaitDotnetAssert } = apiWith();

    await pingServersAsync(api, []);

    expect(awaitDotnetAssert).not.toHaveBeenCalled();
    expect(pingFromBridgeAsync).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ bridgeFolder: expect.any(String) }),
    );
  });

  it("makes sure .NET is there before pinging", async () => {
    const { api, awaitDotnetAssert } = apiWith();
    const servers = [{ address: "a", port: 1 }];

    await pingServersAsync(api, servers);

    expect(awaitDotnetAssert).toHaveBeenCalled();
    expect(pingFromBridgeAsync).toHaveBeenCalledWith(
      servers,
      expect.objectContaining({ bridgeFolder: expect.any(String) }),
    );
  });
});

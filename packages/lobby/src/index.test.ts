import { EventEmitter } from "events";
import { PassThrough } from "stream";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile, spawn } from "child_process";
import { promises as fs } from "node:fs";
import {
  fetchLobbyServersAsync,
  getLobbyPlatform,
  LobbyError,
  pingServersAsync,
} from "./index";

vi.mock("child_process", () => ({ execFile: vi.fn(), spawn: vi.fn() }));
vi.mock("node:fs", () => ({ promises: { access: vi.fn() } }));

type Lobby = typeof import("./index");

class FakeChild extends EventEmitter {
  public stdout = new PassThrough();
  public stderr = new PassThrough();
  public exitCode: number | null = null;
  public kill = vi.fn(() => {
    queueMicrotask(() => this.emit("close", null));
    return true;
  });

  /**
   * Writes the output and exits with the code
   */
  public finish(stdout: string, code = 0, stderr = ""): void {
    this.stdout.write(stdout);
    this.stderr.write(stderr);
    // Let the data events run before the process closes
    setImmediate(() => {
      this.exitCode = code;
      this.emit("close", code);
    });
  }
}

const BRIDGE_FOLDER = "D:\\Vortex\\plugins\\bannerlord";
const REGISTERED_DOTNET = "E:\\dotnet";
const OPTIONS = { bridgeFolder: BRIDGE_FOLDER };
const REQUEST = {
  gamePath: "C:\\Games\\Bannerlord",
  binaryPath: "bin\\Win64_Shipping_Client",
  store: "steam",
};

let children: FakeChild[] = [];

/**
 * A fresh module, the dotnet host it finds is cached for the session
 */
const loadFreshLobby = async (): Promise<Lobby> => {
  vi.resetModules();
  return await import("./index");
};

const lastChild = (): FakeChild => {
  const child = children.at(-1);
  if (child === undefined) {
    throw new Error("The bridge was not started");
  }
  return child;
};

/**
 * Lets the bridge start: the dotnet host lookup is asynchronous
 */
const untilSpawned = async (): Promise<FakeChild> => {
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  return lastChild();
};

const serverEntry = (name: string) => ({
  Id: { Guid: `guid-${name}` },
  Address: "203.0.113.7",
  Port: 7210,
  ServerName: name,
});

beforeEach(() => {
  children = [];
  vi.mocked(spawn).mockReset();
  vi.mocked(spawn).mockImplementation((() => {
    const child = new FakeChild();
    children.push(child);
    return child;
  }) as unknown as typeof spawn);
  vi.mocked(execFile).mockReset();
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    callback(
      null,
      `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\r\n    InstallLocation    REG_SZ    ${REGISTERED_DOTNET}\\\r\n`,
    );
  }) as unknown as typeof execFile);
  vi.mocked(fs.access).mockReset();
  vi.mocked(fs.access).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getLobbyPlatform", () => {
  it("signs in with Steam and GOG", async () => {
    expect(getLobbyPlatform("steam")).toBe("steam");
    expect(getLobbyPlatform("gog")).toBe("gog");
  });

  it.each([["epic"], ["xbox"]])(
    "explains why the %s version can't reach the lobby",
    async (store) => {
      expect(() => getLobbyPlatform(store)).toThrow(LobbyError);
      expect(() => getLobbyPlatform(store)).toThrow(/added by address/);
    },
  );

  it("names the store it doesn't know", async () => {
    expect(() => getLobbyPlatform("origin")).toThrow(
      "Listing lobby servers is not supported for the origin version of the game",
    );
    expect(() => getLobbyPlatform(undefined)).toThrow(/unknown version/);
  });
});

describe("fetchLobbyServersAsync", () => {
  it("runs the bridge from its folder with the registered x64 dotnet host", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish('{"ok":true}');
    await promise;

    expect(spawn).toHaveBeenCalledWith(
      path.join(REGISTERED_DOTNET, "dotnet.exe"),
      [
        path.join(BRIDGE_FOLDER, "Bannerlord.LobbyBridge.dll"),
        "servers",
        "--game",
        REQUEST.gamePath,
        "--bin",
        REQUEST.binaryPath,
        "--platform",
        "steam",
      ],
      expect.objectContaining({ cwd: BRIDGE_FOLDER, windowsHide: true }),
    );
  });

  it("falls back to dotnet from PATH when no x64 host exists", async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    const fresh = await loadFreshLobby();

    const promise = fresh.fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish('{"ok":true}');
    await promise;

    expect(vi.mocked(spawn).mock.calls[0]?.[0]).toBe("dotnet");
  });

  it("doesn't start the bridge for a store it can't sign in with", async () => {
    await expect(
      fetchLobbyServersAsync({ ...REQUEST, store: "epic" }, OPTIONS),
    ).rejects.toBeInstanceOf(LobbyError);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reads the result line among the runtime's other output", async () => {
    const result = {
      ok: true,
      platform: "steam",
      applicationVersion: "v1.2.12.0",
      availableCustomGames: {
        CustomGameServerInfos: [serverEntry("EU #1"), serverEntry("NA #2")],
      },
    };

    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish(
      [
        "Steamworks initialized",
        "{not json",
        JSON.stringify(result),
        "Shutting down",
        "",
      ].join("\r\n"),
    );
    const list = await promise;

    expect(list).toMatchObject({
      platform: "steam",
      applicationVersion: "v1.2.12.0",
      servers: [{ ServerName: "EU #1" }, { ServerName: "NA #2" }],
    });
    expect(list.fetchedAt).toEqual(expect.any(Number));
  });

  it("takes the last line that is JSON, whatever comes after it", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish(
      [
        '{"ok":false,"error":"earlier attempt"}',
        '{"ok":true,"applicationVersion":"v1.2.12.0"}',
        "{ unterminated",
        "",
      ].join("\n"),
    );

    expect((await promise).applicationVersion).toBe("v1.2.12.0");
  });

  it("reports a bridge that exits cleanly without a result", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish("Steamworks initialized\n", 0, "warning");

    await expect(promise).rejects.toThrow(
      "The lobby bridge produced no result\nwarning",
    );
  });

  it("keeps only the end of a long stderr", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish("", 1, `${"x".repeat(9000)}END`);

    const error = await promise.then(
      () => "resolved",
      (err: Error) => err.message,
    );

    expect(error).toMatch(/exited with code 1\nx+END$/);
    expect(error.length).toBeLessThanOrEqual(
      "The lobby bridge exited with code 1\n".length + 2000,
    );
  });

  it("reports a bridge the system refuses to start", async () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("spawn EACCES");
    });

    await expect(fetchLobbyServersAsync(REQUEST, OPTIONS)).rejects.toThrow(
      "spawn EACCES",
    );
  });

  it("looks the dotnet host up once for the session", async () => {
    const fresh = await loadFreshLobby();

    for (const _ of [1, 2]) {
      const promise = fresh.fetchLobbyServersAsync(REQUEST, OPTIONS);
      (await untilSpawned()).finish('{"ok":true}');
      await promise;
      vi.mocked(spawn).mockClear();
    }

    expect(execFile).toHaveBeenCalledTimes(1);
    expect(fs.access).toHaveBeenCalledTimes(1);
  });

  it("uses the dotnet in Program Files when none is registered", async () => {
    vi.stubEnv("ProgramW6432", "C:\\PF");
    vi.mocked(execFile).mockImplementation(((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      callback(new Error("The system was unable to find the key"), "");
    }) as unknown as typeof execFile);
    const fresh = await loadFreshLobby();

    try {
      const promise = fresh.fetchLobbyServersAsync(REQUEST, OPTIONS);
      (await untilSpawned()).finish('{"ok":true}');
      await promise;
    } finally {
      vi.unstubAllEnvs();
    }

    expect(vi.mocked(spawn).mock.calls[0]?.[0]).toBe(
      path.join("C:\\PF", "dotnet", "dotnet.exe"),
    );
    expect(fs.access).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when the lobby lists no servers", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish(
      '{"ok":true,"availableCustomGames":{"CustomGameServerInfos":null}}',
    );

    expect(await promise).toMatchObject({
      applicationVersion: "",
      servers: [],
    });
  });

  it("throws the bridge's own error", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish(
      '{"ok":false,"error":"Steam is not running"}',
      1,
    );

    await expect(promise).rejects.toThrow(LobbyError);
    await expect(promise).rejects.toThrow("Steam is not running");
  });

  it("reports the exit code and the end of stderr when there is no result", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).finish(
      "",
      -532462766,
      "Unhandled exception. System.IO.FileNotFoundException",
    );

    await expect(promise).rejects.toThrow(
      "The lobby bridge exited with code -532462766\nUnhandled exception. System.IO.FileNotFoundException",
    );
  });

  it("reports a bridge that fails to start", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    (await untilSpawned()).emit("error", new Error("spawn dotnet ENOENT"));

    await expect(promise).rejects.toThrow("spawn dotnet ENOENT");
  });

  it("stops a bridge that hangs", async () => {
    vi.useFakeTimers();

    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    const rejection = expect(promise).rejects.toThrow(
      "The lobby bridge did not finish in 120s and was stopped",
    );
    await vi.advanceTimersByTimeAsync(120_000);

    await rejection;
    expect(lastChild().kill).toHaveBeenCalled();
  });

  it("stops a bridge that writes far more than a server list", async () => {
    const promise = fetchLobbyServersAsync(REQUEST, OPTIONS);
    const child = await untilSpawned();
    child.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1, " "));

    await expect(promise).rejects.toThrow(
      "The lobby bridge wrote more output than a server list",
    );
    expect(child.kill).toHaveBeenCalled();
  });
});

describe("pingServersAsync", () => {
  it("doesn't start the bridge without servers", async () => {
    expect(await pingServersAsync([], OPTIONS)).toEqual({});
    expect(spawn).not.toHaveBeenCalled();
  });

  it("maps the pings back to server ids, dropping malformed ones", async () => {
    const servers = [
      { address: "EU.Example.com", port: 7210 },
      { address: "2001:db8::1", port: 7300 },
      { address: "10.0.0.1", port: 7210 },
      { address: "10.0.0.2", port: 7210 },
      { address: "10.0.0.3", port: 7210 },
    ];

    const promise = pingServersAsync(servers, OPTIONS);
    const child = await untilSpawned();
    child.finish(
      JSON.stringify({
        ok: true,
        pings: {
          "EU.Example.com:7210": { ms: 42, method: "icmp", via: null },
          "[2001:db8::1]:7300": { ms: 0, method: "route", via: "10.1.1.1" },
          "10.0.0.1:7210": { ms: 15, method: "udp" },
          "10.0.0.2:7210": { ms: -1, method: "tcp" },
        },
      }),
    );

    expect(await promise).toEqual({
      "eu.example.com:7210": { ms: 42, method: "icmp", via: null },
      "[2001:db8::1]:7300": { ms: 0, method: "route", via: "10.1.1.1" },
      "10.0.0.1:7210": null,
      "10.0.0.2:7210": null,
      "10.0.0.3:7210": null,
    });
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual([
      path.join(BRIDGE_FOLDER, "Bannerlord.LobbyBridge.dll"),
      "ping",
      "--targets",
      "EU.Example.com:7210,[2001:db8::1]:7300,10.0.0.1:7210,10.0.0.2:7210,10.0.0.3:7210",
    ]);
  });

  it("answers null for every server when the bridge fails", async () => {
    const log = vi.fn();

    const promise = pingServersAsync(
      [
        { address: "a", port: 1 },
        { address: "b", port: 2 },
      ],
      { ...OPTIONS, log },
    );
    (await untilSpawned()).finish('{"ok":false}', 1);

    expect(await promise).toEqual({ "a:1": null, "b:2": null });
    expect(log).toHaveBeenCalledWith("warn", "pinging servers failed", {
      error: "The lobby bridge exited with code 1",
    });
  });

  it("answers null for every server when the bridge answers without pings", async () => {
    const promise = pingServersAsync([{ address: "a", port: 1 }], OPTIONS);
    (await untilSpawned()).finish('{"ok":true}');

    expect(await promise).toEqual({ "a:1": null });
  });

  it("gives up on pinging after 10s", async () => {
    vi.useFakeTimers();

    const promise = pingServersAsync([{ address: "a", port: 1 }], OPTIONS);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await promise).toEqual({ "a:1": null });
    expect(lastChild().kill).toHaveBeenCalled();
  });
});

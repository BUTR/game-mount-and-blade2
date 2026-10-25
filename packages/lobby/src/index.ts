import { ChildProcess, execFile, spawn } from "child_process";
import { promises as fs } from "node:fs";
import path from "path";
import {
  formatServerAddress,
  getServerId,
  IServerAddress,
} from "@bannerlord/server-query/address";

/**
 * Bannerlord.LobbyBridge is a .NET 9 utility shipped alongside its users.
 * It loads the game's official lobby client from the local installation, logs in
 * using the platform the game was purchased on, and outputs the custom server list as JSON.
 */
const BRIDGE_ASSEMBLY = "Bannerlord.LobbyBridge.dll";
// The bridge aborts on its own after ~80s (connect: 45s, request: 30s, logout: 5s); this timeout guards against hangs.
const BRIDGE_TIMEOUT_MS = 120_000;
// Typical output is ~100 KiB for 150 servers. Output far exceeding this is invalid, so the bridge process is terminated.
const BRIDGE_MAX_STDOUT_BYTES = 16 * 1024 * 1024;
// Retain only the tail of stderr to provide concise diagnostics if the process fails.
const BRIDGE_STDERR_TAIL_BYTES = 8 * 1024;
// The ping command self-terminates within ~5s; this timeout guards against hangs.
const PING_TIMEOUT_MS = 10_000;

/**
 * Stores (Vortex's ids for them) supported by the bridge for lobby authentication.
 * Steam and GOG require their respective desktop clients to be running.
 * The Epic version authenticates via a single-use exchange code passed by the Epic Games Launcher
 * at startup (-AUTH_PASSWORD); because of this, external authentication outside the launcher is not supported.
 */
const SUPPORTED_PLATFORMS: Record<string, string> = {
  steam: "steam",
  gog: "gog",
};

const UNSUPPORTED_PLATFORM_REASONS: Record<string, string> = {
  epic:
    "The Epic version of the game signs in with a one-time code the Epic Games Launcher gives it when it starts " +
    "the game, so the lobby can't be reached outside the game. Servers can still be added by address.",
  xbox:
    "The Xbox version of the game reaches the lobby through Xbox Live as the game title itself, which only the " +
    "game can do. Servers can still be added by address.",
};

/**
 * TaleWorlds.MountAndBlade.Diamond.ModuleInfoModel
 */
export interface ILobbyModule {
  Id: string;
  Name: string;
  Version: string;
  Category: number;
}

/**
 * TaleWorlds.MountAndBlade.Diamond.GameServerEntry
 */
export interface ILobbyServer {
  Id: { Guid: string };
  Address: string;
  Port: number;
  Region: string;
  PlayerCount: number;
  MaxPlayerCount: number;
  ServerName: string;
  GameModule: string;
  GameType: string;
  Map: string;
  UniqueMapId: string | null;
  IsOfficial: boolean;
  ByOfficialProvider: boolean;
  PasswordProtected: boolean;
  Permission: number;
  CrossplayEnabled: boolean;
  HostName: string | null;
  LoadedModules: ILobbyModule[] | null;
  AllowsOptionalModules: boolean;
}

export interface ILobbyServerList {
  platform: string;
  applicationVersion: string;
  servers: ILobbyServer[];
  fetchedAt: number;
}

interface IBridgeOutput {
  ok: boolean;
  error?: string;
  platform?: string;
  applicationVersion?: string;
  availableCustomGames?: { CustomGameServerInfos?: ILobbyServer[] | null };
}

export class LobbyError extends Error {}

export type LobbyLogLevel = "debug" | "warn";

export interface ILobbyBridgeOptions {
  /**
   * The folder with Bannerlord.LobbyBridge.dll, it runs from there
   */
  bridgeFolder: string;
  log?: (
    level: LobbyLogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ) => void;
}

// Ensure any bridge processes still running when the process exits are terminated, as they hold an active lobby session.
const runningBridges = new Set<ChildProcess>();
let exitHookInstalled = false;
const installExitHook = (): void => {
  if (exitHookInstalled) {
    return;
  }
  exitHookInstalled = true;
  const stopAll = (): void => {
    for (const child of runningBridges) {
      child.kill();
    }
  };
  process.once("exit", stopAll);
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", stopAll);
  }
};

/**
 * Where the .NET installer put the x64 runtime, as it records it for hosts to find. Always in the 32-bit registry view.
 * On ARM64 Windows this is the dotnet\x64 folder, the dotnet.exe in Program Files there is the ARM64 host
 */
const readRegisteredDotnetRootAsync = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    execFile(
      "reg.exe",
      [
        "query",
        "HKLM\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64",
        "/v",
        "InstallLocation",
        "/reg:32",
      ],
      { windowsHide: true, timeout: 5_000 },
      (error, stdout) =>
        resolve(
          error === null
            ? /InstallLocation\s+REG_SZ\s+(.+)/.exec(stdout)?.[1]?.trim()
            : undefined,
        ),
    );
  });

let dotnetHost: string | undefined;

/**
 * The x64 dotnet host, found the way an apphost finds the runtime: the registered location, then the default one.
 * DOTNET_ROOT is left out, on developer machines it often names an SDK only folder. A bare `dotnet` would be resolved
 * through PATH, which the process inherited when it started: it misses a runtime installed since, and an x86 host listed
 * first can't load the x64 bridge. Cached once found, a runtime may still be installed while it is missing
 */
const getDotnetHostAsync = async (
  options: ILobbyBridgeOptions,
): Promise<string> => {
  if (dotnetHost !== undefined) {
    return dotnetHost;
  }
  const roots = [
    await readRegisteredDotnetRootAsync(),
    path.join(process.env["ProgramW6432"] ?? "C:\\Program Files", "dotnet"),
  ];
  for (const root of roots) {
    if (root === undefined) {
      continue;
    }
    const host = path.join(root, "dotnet.exe");
    const exists = await fs.access(host).then(
      () => true,
      () => false,
    );
    if (exists) {
      dotnetHost = host;
      break;
    }
  }
  if (dotnetHost === undefined) {
    options.log?.("warn", "no x64 dotnet host found, using dotnet from PATH");
  }
  return dotnetHost ?? "dotnet";
};

/**
 * Executes the bridge asynchronously with safeguards: ignores stdin, streams output up to a size cap,
 * and terminates the process if it times out or produces excessive output. Never rejects.
 */
const runBridgeAsync = async (
  options: ILobbyBridgeOptions,
  args: string[],
  timeoutMs: number = BRIDGE_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; error: Error | null }> => {
  const host = await getDotnetHostAsync(options);
  const { bridgeFolder } = options;
  return new Promise((resolve) => {
    installExitHook();
    const startedAt = Date.now();
    let child: ChildProcess;
    try {
      child = spawn(host, [path.join(bridgeFolder, BRIDGE_ASSEMBLY), ...args], {
        windowsHide: true,
        cwd: bridgeFolder,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }
    runningBridges.add(child);
    options.log?.("debug", "lobby bridge started", {
      spawnMs: Date.now() - startedAt,
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let failure: Error | null = null;
    let settled = false;

    const stop = (reason: Error): void => {
      failure ??= reason;
      child.kill();
    };
    const timer = setTimeout(
      () =>
        stop(
          new Error(
            `The lobby bridge did not finish in ${timeoutMs / 1000}s and was stopped`,
          ),
        ),
      timeoutMs,
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > BRIDGE_MAX_STDOUT_BYTES) {
        stop(
          new Error("The lobby bridge wrote more output than a server list"),
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(
        -BRIDGE_STDERR_TAIL_BYTES,
      );
    });

    const finish = (error: Error | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      runningBridges.delete(child);
      options.log?.("debug", "lobby bridge finished", {
        totalMs: Date.now() - startedAt,
        stdoutBytes,
        exitCode: child.exitCode,
        error: (failure ?? error)?.message,
      });
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr,
        error: failure ?? error,
      });
    };
    // Failed to spawn (e.g., missing binary or blocked by antivirus). 'close' might not fire.
    child.once("error", (err) => {
      child.kill();
      finish(err);
    });
    child.once("close", (code) =>
      finish(
        code === 0 || code === null
          ? null
          : new Error(`The lobby bridge exited with code ${code}`),
      ),
    );
  });
};

/**
 * The bridge writes exactly one JSON line to stdout. Native runtime libraries may print auxiliary output around it.
 */
const parseBridgeOutput = (stdout: string): IBridgeOutput | null => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"));
  for (const line of lines.reverse()) {
    try {
      return JSON.parse(line) as IBridgeOutput;
    } catch {
      // not the result line
    }
  }
  return null;
};

export interface ILobbyServersRequest {
  /**
   * The game's folder, the bridge loads the lobby client from it
   */
  gamePath: string;
  /**
   * The store the game was bought on, as Vortex names it
   */
  store: string | undefined;
}

/**
 * The platform the bridge signs in with for the store. Throws a LobbyError saying why for a store it can't sign in with
 */
export const getLobbyPlatform = (store: string | undefined): string => {
  const platform = store !== undefined ? SUPPORTED_PLATFORMS[store] : undefined;
  if (platform === undefined) {
    throw new LobbyError(
      (store !== undefined ? UNSUPPORTED_PLATFORM_REASONS[store] : undefined) ??
        `Listing lobby servers is not supported for the ${store ?? "unknown"} version of the game`,
    );
  }
  return platform;
};

/**
 * Fetches the list of custom servers from the lobby via the bridge, signing in with the store the game was bought on
 */
export const fetchLobbyServersAsync = async (
  request: ILobbyServersRequest,
  options: ILobbyBridgeOptions,
): Promise<ILobbyServerList> => {
  const { gamePath, store } = request;
  const platform = getLobbyPlatform(store);

  const { stdout, stderr, error } = await runBridgeAsync(options, [
    "servers",
    "--game",
    gamePath,
    "--platform",
    platform,
  ]);

  const parseStartedAt = Date.now();
  const output = parseBridgeOutput(stdout);
  options.log?.("debug", "lobby bridge output parsed", {
    parseMs: Date.now() - parseStartedAt,
  });
  if (output === null) {
    const reason = error?.message ?? "The lobby bridge produced no result";
    throw new LobbyError(`${reason}\n${stderr.slice(-2000)}`);
  }
  if (!output.ok) {
    throw new LobbyError(output.error ?? "The lobby bridge failed");
  }

  return {
    platform,
    applicationVersion: output.applicationVersion ?? "",
    servers: output.availableCustomGames?.CustomGameServerInfos ?? [],
    fetchedAt: Date.now(),
  };
};

/**
 * Ping measurement details:
 * - icmp: Standard ICMP echo request matching the game's internal measurement.
 * - tcp: TCP handshake latency to the server port when ICMP is dropped/blocked.
 * - route: Latency estimate for hosts dropping both (e.g., official servers), measured to the last reachable hop in the route.
 */
export interface IServerPing {
  ms: number;
  method: "icmp" | "tcp" | "route";
  via: string | null;
}

/**
 * Map of server ID to ping result, or null if the server was unreachable across all probe methods.
 */
export type ServerPings = Readonly<Record<string, IServerPing | null>>;

const parsePing = (value: unknown): IServerPing | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { ms, method, via } = value as {
    ms?: unknown;
    method?: unknown;
    via?: unknown;
  };
  return typeof ms === "number" &&
    Number.isFinite(ms) &&
    ms >= 0 &&
    (method === "icmp" || method === "tcp" || method === "route")
    ? { ms, method, via: typeof via === "string" ? via : null }
    : null;
};

/**
 * Measures latency to servers matching the game's server list behavior (`LobbyClient.GetPingToServer`).
 * Probes each host using ICMP echo, falls back to TCP handshake latency if ICMP is blocked,
 * or estimates latency via the last responding route hop if neither responds.
 * Uses the bridge for raw socket accuracy and concurrency. Unresponsive servers or bridge failures yield null. Never rejects.
 */
export const pingServersAsync = async (
  servers: IServerAddress[],
  options: ILobbyBridgeOptions,
): Promise<ServerPings> => {
  const none = Object.fromEntries(
    servers.map((server) => [getServerId(server), null]),
  ) as ServerPings;
  if (servers.length === 0) {
    return none;
  }
  const targets = servers.map(formatServerAddress);
  const { stdout, error } = await runBridgeAsync(
    options,
    ["ping", "--targets", targets.join(",")],
    PING_TIMEOUT_MS,
  );
  const output = parseBridgeOutput(stdout) as {
    ok?: boolean;
    pings?: Record<string, unknown>;
  } | null;
  if (output?.ok !== true || output.pings === undefined) {
    options.log?.("warn", "pinging servers failed", { error: error?.message });
    return none;
  }
  const pings = output.pings;
  return Object.fromEntries(
    servers.map((server, index) => [
      getServerId(server),
      parsePing(pings[targets[index]!]),
    ]),
  ) as ServerPings;
};

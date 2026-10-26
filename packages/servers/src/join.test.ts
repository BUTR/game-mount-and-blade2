import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { log, selectors, types } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { ILobbyModule, ILobbyServer } from "@bannerlord/lobby";
import { GAME_ID } from "@bannerlord/core/common";
import { IBannerlordMod, IModuleCache } from "@bannerlord/core/types";
import { DeployModStatus } from "@bannerlord/core/blse/modDeploy";
import { resolveModDeployAsync } from "@bannerlord/core/blse/deploy";
import { downloadAndEnableLatestModVersionAsync } from "@bannerlord/core/vortex/modDownloader";
import { IClientModuleStatus } from "./modules";
import { IServerRow } from "./row";
import {
  buildJoinArguments,
  checkServerJoinDeploy,
  getCurrentProfileBlockers,
  getJoinBlockers,
  getJoinUnsupportedReason,
  getSharedJoinBlockers,
  IJoinTarget,
  isGameRunning,
  isOfficialServer,
  isServerJoinAvailable,
  isServerJoinDisabled,
  isServerJoinMod,
  JOIN_MODULE_ID,
  launchJoinAsync,
  resolveJoinModules,
  SERVER_JOIN_MOD_ID,
  setUpServerJoinAsync,
} from "./join";

vi.mock("@butr/vortexextensionnative", () => ({
  types: {
    ApplicationVersionType: {
      Alpha: "Alpha",
      Beta: "Beta",
      EarlyAccess: "EarlyAccess",
      Release: "Release",
      Development: "Development",
      Invalid: "Invalid",
    },
    LoadType: {
      None: "None",
      LoadAfterThis: "LoadAfterThis",
      LoadBeforeThis: "LoadBeforeThis",
    },
  },
  BannerlordModuleManager: {
    // Reversed, so the tests see that the result is the sorter's
    sort: vi.fn((modules: unknown[]) => [...modules].reverse()),
    getDependenciesAll: (module: { dependentModuleMetadatas?: unknown[] }) =>
      module.dependentModuleMetadatas ?? [],
  },
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actions: new Proxy(
    {},
    {
      get:
        (_, type) =>
        (...args: unknown[]) => ({ type: String(type), args }),
    },
  ),
  // The stub answers every selector with undefined, which would make isServerJoinDisabled false for the wrong reason
  selectors: { activeProfile: vi.fn() },
  log: vi.fn(),
}));

vi.mock("@bannerlord/core/blse/deploy", () => ({
  resolveModDeployAsync: vi.fn(async () => undefined),
}));
vi.mock("@bannerlord/core/vortex/modDownloader", () => ({
  downloadAndEnableLatestModVersionAsync: vi.fn(async () => undefined),
}));

const lobby = (overrides: Partial<ILobbyServer> = {}): ILobbyServer => ({
  Id: { Guid: "0b5c6a52-3f0e-4c09-9d1e-1c2b3a4d5e6f" },
  Address: "203.0.113.7",
  Port: 7210,
  Region: "EU",
  PlayerCount: 0,
  MaxPlayerCount: 100,
  ServerName: "Server",
  GameModule: "Native",
  GameType: "Skirmish",
  Map: "mp_skirmish_map_001",
  UniqueMapId: null,
  IsOfficial: false,
  ByOfficialProvider: false,
  PasswordProtected: false,
  Permission: 0,
  CrossplayEnabled: false,
  HostName: null,
  LoadedModules: [],
  AllowsOptionalModules: true,
  ...overrides,
});

const row = (overrides: Partial<IServerRow> = {}): IServerRow => ({
  id: "203.0.113.7:7210",
  address: "203.0.113.7",
  port: 7210,
  manual: null,
  lobby: lobby(),
  probe: null,
  extension: null,
  pinned: false,
  favorite: false,
  ...overrides,
});

const lobbyModule = (Id: string): ILobbyModule => ({
  Id,
  Name: Id,
  Version: "v1.0.0.0",
  Category: 0,
});

const STEAM: IJoinTarget = {
  store: "steam",
  gamePath: "C:\\Games\\Bannerlord",
  gameRunning: false,
};

const dependency = (
  id: string,
  options: { optional?: boolean; incompatible?: boolean; after?: boolean } = {},
) => ({
  id,
  isOptional: options.optional ?? false,
  isIncompatible: options.incompatible ?? false,
  loadType: options.after ? "LoadAfterThis" : "LoadBeforeThis",
});

const moduleCache = (
  modules: Record<string, ReturnType<typeof dependency>[]>,
): IModuleCache =>
  Object.fromEntries(
    Object.entries(modules).map(([id, dependentModuleMetadatas]) => [
      id,
      { id, name: id, dependentModuleMetadatas },
    ]),
  ) as unknown as IModuleCache;

const mod = (
  id: string,
  attributes: Record<string, unknown>,
  state = "installed",
): IBannerlordMod =>
  ({ id, type: "", state, attributes }) as unknown as IBannerlordMod;

const status = (
  name: string,
  state: IClientModuleStatus["state"],
  required = true,
): IClientModuleStatus => ({
  requirement: {
    id: name,
    name,
    version: "v1.0.0.0",
    required,
    fromLobby: true,
    nexusMods: null,
    url: null,
  },
  state,
  localVersion: null,
});

describe("isOfficialServer", () => {
  it("counts TaleWorlds-hosted servers as official", () => {
    expect(isOfficialServer(lobby())).toBe(false);
    expect(isOfficialServer(lobby({ IsOfficial: true }))).toBe(true);
    expect(isOfficialServer(lobby({ ByOfficialProvider: true }))).toBe(true);
  });
});

describe("getJoinUnsupportedReason", () => {
  it("doesn't object to a server the lobby doesn't list", () => {
    expect(getJoinUnsupportedReason(row({ lobby: null }))).toBeNull();
  });

  it("leaves official servers to the game", () => {
    expect(
      getJoinUnsupportedReason(row({ lobby: lobby({ IsOfficial: true }) })),
    ).toMatch(/Official servers/);
  });

  it("refuses a server that would reject the join module", () => {
    expect(
      getJoinUnsupportedReason(
        row({
          lobby: lobby({
            AllowsOptionalModules: false,
            LoadedModules: [lobbyModule("Bannerlord.Harmony")],
          }),
        }),
      ),
    ).toMatch(/doesn't allow optional mods/);
  });

  it("accepts a server that lists the join module or allows optional modules", () => {
    expect(
      getJoinUnsupportedReason(
        row({
          lobby: lobby({
            AllowsOptionalModules: false,
            LoadedModules: [lobbyModule(JOIN_MODULE_ID)],
          }),
        }),
      ),
    ).toBeNull();
    expect(
      getJoinUnsupportedReason(
        row({
          lobby: lobby({ AllowsOptionalModules: true, LoadedModules: null }),
        }),
      ),
    ).toBeNull();
  });
});

describe("getSharedJoinBlockers", () => {
  it("has none for a community server on Steam or GOG", () => {
    expect(getSharedJoinBlockers(row(), STEAM)).toEqual([]);
    expect(getSharedJoinBlockers(row(), { ...STEAM, store: "gog" })).toEqual(
      [],
    );
  });

  it("needs the game to be discovered", () => {
    expect(
      getSharedJoinBlockers(row(), { ...STEAM, gamePath: undefined }),
    ).toEqual(["Bannerlord has not been discovered."]);
  });

  it.each([["epic"], ["xbox"], [undefined]])(
    "can't join with the %s version",
    (store) => {
      expect(getSharedJoinBlockers(row(), { ...STEAM, store })).toEqual([
        `Joining from Vortex needs the Steam or GOG version of the game, this is the ${store ?? "unknown"} version.`,
      ]);
    },
  );

  it("needs the server in the lobby list and the game not running", () => {
    expect(
      getSharedJoinBlockers(row({ lobby: null }), {
        ...STEAM,
        gameRunning: true,
      }),
    ).toEqual([
      "The server is not in the lobby list. Refresh the lobby to join it.",
      "Bannerlord or another tool started from Vortex is running. Vortex doesn't deploy mods while it runs.",
    ]);
  });
});

describe("isServerJoinAvailable", () => {
  const serverJoinMod = mod("sj", { modId: SERVER_JOIN_MOD_ID });

  it("is available when Server Join is installed in Vortex", () => {
    expect(isServerJoinAvailable({ sj: serverJoinMod }, null, null)).toBe(true);
  });

  it("doesn't count a Server Join mod that isn't installed yet", () => {
    expect(
      isServerJoinAvailable(
        { sj: mod("sj", { modId: SERVER_JOIN_MOD_ID }, "downloading") },
        {},
        new Set(),
      ),
    ).toBe(false);
  });

  it("is available when the module is deployed or staged from elsewhere", () => {
    expect(
      isServerJoinAvailable(
        undefined,
        moduleCache({ [JOIN_MODULE_ID]: [] }),
        null,
      ),
    ).toBe(true);
    expect(
      isServerJoinAvailable(undefined, null, new Set([JOIN_MODULE_ID])),
    ).toBe(true);
  });

  it("is unknown while the modules are being read", () => {
    expect(isServerJoinAvailable({}, null, new Set())).toBeNull();
    expect(isServerJoinAvailable({}, {}, null)).toBeNull();
  });

  it("is unavailable once nothing provides it", () => {
    expect(isServerJoinAvailable({}, {}, new Set(["Other"]))).toBe(false);
  });
});

describe("isServerJoinMod", () => {
  it("recognizes the Nexus Mods page, even stored as text", () => {
    expect(isServerJoinMod(mod("a", { modId: SERVER_JOIN_MOD_ID }))).toBe(true);
    expect(
      isServerJoinMod(mod("a", { modId: String(SERVER_JOIN_MOD_ID) })),
    ).toBe(true);
  });

  it("recognizes a mod that provides the join module", () => {
    expect(
      isServerJoinMod(mod("a", { subModsIds: ["X", JOIN_MODULE_ID] })),
    ).toBe(true);
  });

  it("doesn't take other mods", () => {
    expect(isServerJoinMod(mod("a", { modId: 1, subModsIds: ["X"] }))).toBe(
      false,
    );
    expect(isServerJoinMod(mod("a", {}))).toBe(false);
  });
});

describe("getCurrentProfileBlockers", () => {
  const withJoinModule = moduleCache({ [JOIN_MODULE_ID]: [] });

  it("waits for the installed modules", () => {
    expect(getCurrentProfileBlockers(null, [])).toEqual([
      "Reading the installed modules...",
    ]);
  });

  it("asks to install Server Join, or to enable it when Vortex has it", () => {
    expect(getCurrentProfileBlockers({}, [])[0]).toMatch(/^Install the BUTR/);
    expect(getCurrentProfileBlockers({}, [], true)[0]).toMatch(
      /^Enable Server Join/,
    );
  });

  it("lists the required mods that aren't deployed", () => {
    expect(
      getCurrentProfileBlockers(withJoinModule, [
        status("Harmony", "installed"),
        status("ButterLib", "in-vortex"),
        status("MCM", "different-version"),
        status("Optional", "missing", false),
      ]),
    ).toEqual(["Install the required mods first: ButterLib, MCM."]);
  });

  it("has none when everything is deployed", () => {
    expect(
      getCurrentProfileBlockers(withJoinModule, [status("A", "installed")]),
    ).toEqual([]);
  });
});

describe("getJoinBlockers", () => {
  it("lists the shared blockers before the profile's", () => {
    expect(
      getJoinBlockers(row({ lobby: null }), {
        ...STEAM,
        installedModules: null,
        requiredModules: [],
      }),
    ).toEqual([
      "The server is not in the lobby list. Refresh the lobby to join it.",
      "Reading the installed modules...",
    ]);
  });
});

describe("resolveJoinModules", () => {
  beforeEach(() => {
    vi.mocked(BannerlordModuleManager.sort).mockClear();
  });

  const idsOf = (modules: vetypes.ModuleInfoExtended[]): string[] =>
    modules.map((module) => module.id);

  it("takes the official modules, the load order, the server's modules and the join module, in the sorter's order", () => {
    const installed = moduleCache({
      Native: [],
      Multiplayer: [],
      MyHud: [],
      "Bannerlord.Harmony": [],
      [JOIN_MODULE_ID]: [],
    });

    const { modules, missing } = resolveJoinModules(
      ["Bannerlord.Harmony"],
      installed,
      ["MyHud"],
    );

    const sorted = vi.mocked(BannerlordModuleManager.sort).mock.calls[0]?.[0];
    expect(idsOf(sorted ?? [])).toEqual([
      "Native",
      "Multiplayer",
      "MyHud",
      "Bannerlord.Harmony",
      JOIN_MODULE_ID,
    ]);
    expect(idsOf(modules)).toEqual(idsOf([...(sorted ?? [])].reverse()));
    expect(missing).toEqual([]);
  });

  it("adds required dependencies, but not optional, incompatible or load-after ones", () => {
    const installed = moduleCache({
      Native: [],
      Multiplayer: [],
      [JOIN_MODULE_ID]: [dependency("Bannerlord.Harmony")],
      ServerMod: [
        dependency("ButterLib"),
        dependency("OptionalMod", { optional: true }),
        dependency("Enemy", { incompatible: true }),
        dependency("LoadsAfter", { after: true }),
      ],
      ButterLib: [dependency("Bannerlord.Harmony")],
      "Bannerlord.Harmony": [],
      OptionalMod: [],
      Enemy: [],
      LoadsAfter: [],
    });

    const { modules, missing } = resolveJoinModules(["ServerMod"], installed);

    expect(idsOf(modules).sort()).toEqual(
      [
        "Native",
        "Multiplayer",
        "ServerMod",
        JOIN_MODULE_ID,
        "ButterLib",
        "Bannerlord.Harmony",
      ].sort(),
    );
    expect(missing).toEqual([]);
  });

  it("reports what isn't installed once, and skips load order modules that were removed", () => {
    const installed = moduleCache({
      Native: [],
      Multiplayer: [],
      A: [dependency("Shared")],
      B: [dependency("Shared")],
    });

    const { modules, missing } = resolveJoinModules(
      ["A", "B", "ServerOnly"],
      installed,
      ["RemovedFromDisk"],
    );

    expect(missing).toEqual(["ServerOnly", JOIN_MODULE_ID, "Shared"]);
    expect(idsOf(modules)).not.toContain("RemovedFromDisk");
  });
});

describe("buildJoinArguments", () => {
  const modules = [
    { id: "Native" },
    { id: "Multiplayer" },
    { id: JOIN_MODULE_ID },
  ] as vetypes.ModuleInfoExtended[];

  it("starts multiplayer with the modules and joins the lobby server by id and address", () => {
    expect(buildJoinArguments(modules, row())).toEqual([
      "/multiplayer",
      `_MODULES_*Native*Multiplayer*${JOIN_MODULE_ID}*_MODULES_`,
      "/joinserver",
      "0b5c6a52-3f0e-4c09-9d1e-1c2b3a4d5e6f",
      "203.0.113.7:7210",
    ]);
  });

  it("joins by address alone without a lobby entry, bracketing IPv6", () => {
    expect(
      buildJoinArguments(
        modules,
        row({ lobby: null, address: "2001:db8::1", port: 7300 }),
      ).slice(2),
    ).toEqual(["/joinserver", "[2001:db8::1]:7300"]);
  });
});

describe("isGameRunning", () => {
  const state = (toolsRunning: Record<string, unknown> | undefined) =>
    ({ session: { base: { toolsRunning } } }) as unknown as types.IState;

  it("is running while Vortex tracks any tool", () => {
    expect(isGameRunning(state({}))).toBe(false);
    expect(isGameRunning(state(undefined))).toBe(false);
    expect(isGameRunning(state({ "C:\\Bannerlord.exe": { started: 1 } }))).toBe(
      true,
    );
  });
});

describe("launchJoinAsync", () => {
  type RunOptions = { onSpawned: (pid?: number) => void; cwd: string };

  const apiWith = (
    run: (exe: string, args: string[], options: RunOptions) => Promise<void>,
  ) => {
    const dispatch = vi.fn();
    const runExecutable = vi.fn(run);
    const api = {
      runExecutable,
      store: { dispatch },
    } as unknown as types.IExtensionApi;
    return { api, dispatch, runExecutable };
  };

  const GAME = "C:\\Games\\Bannerlord";
  const BINARIES = path.join(GAME, "bin", "Win64_Shipping_Client");
  const EXE = path.join(BINARIES, "Bannerlord.exe");

  it("starts the game executable and resolves once it is running", async () => {
    let finishRun: () => void = () => undefined;
    const { api, dispatch, runExecutable } = apiWith(
      (_exe, _args, options) =>
        new Promise((resolve) => {
          finishRun = resolve;
          options.onSpawned(4242);
        }),
    );

    await expect(launchJoinAsync(api, GAME, "steam", ["/x"])).resolves.toBe(
      true,
    );

    expect(runExecutable).toHaveBeenCalledWith(
      EXE,
      ["/x"],
      expect.objectContaining({ cwd: BINARIES, detach: true }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setToolRunning",
      args: [EXE, expect.any(Number), true],
    });
    finishRun();
  });

  it("is false when a launch hook cancelled the start", async () => {
    const { api, dispatch } = apiWith(async () => undefined);

    await expect(launchJoinAsync(api, GAME, "gog", [])).resolves.toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects when the game failed to start", async () => {
    const { api, dispatch } = apiWith(async (_exe, _args, options) => {
      options.onSpawned(undefined);
      throw new Error("spawn EACCES");
    });

    await expect(launchJoinAsync(api, GAME, "steam", [])).rejects.toThrow(
      "spawn EACCES",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("stays successful when the game later exits with an error", async () => {
    const { api } = apiWith(async (_exe, _args, options) => {
      options.onSpawned(4242);
      throw new Error("exited with code 1");
    });

    await expect(launchJoinAsync(api, GAME, "steam", [])).resolves.toBe(true);
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        "warn",
        "Bannerlord exited with an error after joining",
        { error: "exited with code 1" },
      ),
    );
  });
});

describe("Server Join in the active profile", () => {
  const serverJoinMod = mod("sj", { modId: SERVER_JOIN_MOD_ID });

  const apiWith = (
    profile: types.IProfile | undefined,
    mods: Record<string, IBannerlordMod>,
    downloads: Record<string, unknown> = {},
  ): types.IExtensionApi => {
    vi.mocked(selectors.activeProfile).mockReturnValue(profile);
    return {
      getState: () => ({
        persistent: {
          mods: { [GAME_ID]: mods },
          downloads: { files: downloads },
        },
      }),
    } as unknown as types.IExtensionApi;
  };

  const profileEnabling = (...modIds: string[]): types.IProfile =>
    ({
      id: "p",
      gameId: GAME_ID,
      modState: Object.fromEntries(
        modIds.map((modId) => [modId, { enabled: true }]),
      ),
    }) as unknown as types.IProfile;

  beforeEach(() => {
    vi.mocked(resolveModDeployAsync).mockClear();
    vi.mocked(downloadAndEnableLatestModVersionAsync).mockClear();
  });

  describe("checkServerJoinDeploy", () => {
    it("is OK when Server Join is enabled, not enabled when only installed", () => {
      const mods = { sj: serverJoinMod };

      expect(
        checkServerJoinDeploy(
          apiWith(undefined, mods),
          profileEnabling("sj"),
          mods,
        ),
      ).toEqual({ status: DeployModStatus.OK });
      expect(
        checkServerJoinDeploy(
          apiWith(undefined, mods),
          profileEnabling(),
          mods,
        ),
      ).toEqual({ status: DeployModStatus.NOT_ENABLED, modId: "sj" });
    });

    it("finds a finished download of Server Join that isn't installed", () => {
      const downloads = {
        dl: {
          state: "finished",
          game: [GAME_ID],
          modInfo: { nexus: { ids: { modId: SERVER_JOIN_MOD_ID } } },
        },
      };

      expect(
        checkServerJoinDeploy(
          apiWith(undefined, {}, downloads),
          profileEnabling(),
          {},
        ),
      ).toEqual({ status: DeployModStatus.NOT_INSTALLED, downloadId: "dl" });
      expect(
        checkServerJoinDeploy(apiWith(undefined, {}), profileEnabling(), {}),
      ).toEqual({ status: DeployModStatus.NOT_DOWNLOADED });
    });
  });

  describe("isServerJoinDisabled", () => {
    it("is disabled when Vortex has Server Join but the active profile doesn't enable it", () => {
      expect(
        isServerJoinDisabled(apiWith(profileEnabling(), { sj: serverJoinMod })),
      ).toBe(true);
    });

    it("isn't when it is enabled, missing or there is no active profile", () => {
      expect(
        isServerJoinDisabled(
          apiWith(profileEnabling("sj"), { sj: serverJoinMod }),
        ),
      ).toBe(false);
      expect(isServerJoinDisabled(apiWith(profileEnabling(), {}))).toBe(false);
      expect(
        isServerJoinDisabled(apiWith(undefined, { sj: serverJoinMod })),
      ).toBe(false);
    });
  });

  describe("setUpServerJoinAsync", () => {
    it("does nothing without an active profile", async () => {
      await setUpServerJoinAsync(apiWith(undefined, {}));

      expect(resolveModDeployAsync).not.toHaveBeenCalled();
    });

    it("resolves what Server Join needs, downloading it from Nexus Mods when it is missing", async () => {
      const profile = profileEnabling();
      const api = apiWith(profile, {});

      await setUpServerJoinAsync(api);

      expect(resolveModDeployAsync).toHaveBeenCalledWith(
        api,
        profile,
        { status: DeployModStatus.NOT_DOWNLOADED },
        expect.any(Function),
        expect.any(Function),
      );
      const download = vi.mocked(resolveModDeployAsync).mock.calls[0]?.[3];
      await download?.(api);
      expect(downloadAndEnableLatestModVersionAsync).toHaveBeenCalledWith(
        api,
        SERVER_JOIN_MOD_ID,
      );
    });
  });
});

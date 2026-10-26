import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectors, types, util } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { LoadOrderManager } from "./manager";
import { readLoadOrderAsync, writeLoadOrderAsync } from "./persistence";
import { orderCurrentLoadOrderByExternalLoadOrderAsync } from "./utils";
import { bselectors } from "../selectors";
import { VortexLauncherManager } from "../launcher/manager";
import { GAME_ID } from "../common";
import { VortexLoadOrderEntry } from "../types";
import { GameMode } from "../settings/types";

vi.mock("@nexusmods/vortex-api", () => {
  class ProcessCanceled extends Error {}
  return {
    selectors: { activeProfile: vi.fn(), discoveryByGame: vi.fn() },
    util: { ProcessCanceled },
    log: vi.fn(),
  };
});

vi.mock("@butr/vortexextensionnative", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@butr/vortexextensionnative")>()),
  BannerlordModuleManager: { validateLoadOrder: vi.fn(() => []) },
  Utils: {
    renderModuleIssue: vi.fn(
      (issue: { reason: string }) => `rendered ${issue.reason}`,
    ),
  },
}));

vi.mock("./persistence", () => ({
  readLoadOrderAsync: vi.fn(async () => []),
  writeLoadOrderAsync: vi.fn(async () => undefined),
}));

vi.mock("./utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils")>()),
  orderCurrentLoadOrderByExternalLoadOrderAsync: vi.fn(),
}));

vi.mock("../selectors", () => ({
  bselectors: { activeGameMode: vi.fn() },
}));

vi.mock("../launcher/manager", () => ({
  VortexLauncherManager: { getInstance: vi.fn() },
}));

vi.mock("../butr/modAnalyzerProxy", () => ({
  ModAnalyzerProxy: vi.fn(function (this: { analyzeAsync: unknown }) {
    this.analyzeAsync = analyzeAsync;
  }),
}));

const analyzeAsync = vi.fn();

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const module = (
  id: string,
  mode: "singleplayer" | "multiplayer" = "singleplayer",
): vetypes.ModuleInfoExtendedWithMetadata =>
  ({
    id,
    name: id,
    isSingleplayerModule: mode === "singleplayer",
    isMultiplayerModule: mode === "multiplayer",
    moduleProviderType: vetypes.ModuleProviderType.Default,
  }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

const entry = (
  id: string,
  options: {
    enabled?: boolean;
    mode?: "singleplayer" | "multiplayer";
    hasObfuscatedBinaries?: boolean | null;
  } = {},
): VortexLoadOrderEntry =>
  ({
    id,
    name: id,
    enabled: options.enabled ?? true,
    data: {
      moduleInfoExtended: module(id, options.mode),
      index: 0,
      hasSteamBinariesOnXbox: null,
      hasObfuscatedBinaries:
        options.hasObfuscatedBinaries === undefined
          ? false
          : options.hasObfuscatedBinaries,
    },
  }) as unknown as VortexLoadOrderEntry;

const launcherManager = {
  getGameVersionVortexAsync: vi.fn(async () => "v1.2.12.0"),
  refreshModulesAsync: vi.fn(async () => undefined),
  getAllModulesWithDuplicatesAsync: vi.fn(
    async (): Promise<vetypes.ModuleInfoExtendedWithMetadata[]> => [],
  ),
  getAllModulesAsync: vi.fn(async () => ({})),
  setModulesToLaunchAsync: vi.fn(async () => undefined),
  isObfuscatedAsync: vi.fn(async () => true),
};

const createApi = (): types.IExtensionApi =>
  ({
    getState: () => ({}),
    store: { dispatch: vi.fn() },
  }) as unknown as types.IExtensionApi;

let gameMode: GameMode;

const activateProfile = (id: string, gameId = GAME_ID): void => {
  vi.mocked(selectors.activeProfile).mockReturnValue({
    id,
    gameId,
  } as types.IProfile);
};

beforeEach(() => {
  vi.clearAllMocks();
  gameMode = "singleplayer";
  vi.mocked(bselectors.activeGameMode).mockImplementation(() => gameMode);
  activateProfile("p1");
  vi.mocked(selectors.discoveryByGame).mockReturnValue({
    path: "C:/Games/Bannerlord",
  } as types.IDiscoveryResult);
  vi.mocked(VortexLauncherManager.getInstance).mockReturnValue(
    launcherManager as unknown as VortexLauncherManager,
  );
  vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync).mockResolvedValue(
    [],
  );
});

describe("serializeLoadOrder", () => {
  it("writes the load order and passes it to the launcher", async () => {
    const manager = new LoadOrderManager(createApi());

    await manager.serializeLoadOrder(
      [entry("Native"), entry("SandBox", { enabled: false })],
      [],
    );

    expect(vi.mocked(writeLoadOrderAsync).mock.calls[0]![1]).toEqual([
      {
        id: "Native",
        name: "Native",
        isSelected: true,
        isDisabled: false,
        index: 0,
      },
      {
        id: "SandBox",
        name: "SandBox",
        isSelected: false,
        isDisabled: false,
        index: 1,
      },
    ]);
    expect(launcherManager.setModulesToLaunchAsync).toHaveBeenCalledTimes(1);
  });

  it("never writes a load order with modules of the other game mode", async () => {
    gameMode = "multiplayer";
    const manager = new LoadOrderManager(createApi());

    await manager.serializeLoadOrder(
      [entry("MPMod", { mode: "multiplayer" }), entry("SandBox")],
      [],
    );

    expect(writeLoadOrderAsync).not.toHaveBeenCalled();
    expect(launcherManager.setModulesToLaunchAsync).not.toHaveBeenCalled();
  });
});

describe("validate", () => {
  it("resolves undefined when no enabled module has issues", async () => {
    const manager = new LoadOrderManager(createApi());

    await expect(
      manager.validate([], [entry("Native"), entry("SandBox")]),
    ).resolves.toBeUndefined();
  });

  it("validates only the enabled modules against each other", async () => {
    const manager = new LoadOrderManager(createApi());

    await manager.validate(
      [],
      [entry("Native"), entry("Off", { enabled: false })],
    );

    expect(BannerlordModuleManager.validateLoadOrder).toHaveBeenCalledTimes(1);
    const [modules, target] = vi.mocked(
      BannerlordModuleManager.validateLoadOrder,
    ).mock.calls[0]!;
    expect(modules.map((x) => x.id)).toEqual(["Native"]);
    expect(target.id).toBe("Native");
  });

  it("reports each issue on the module it targets", async () => {
    vi.mocked(BannerlordModuleManager.validateLoadOrder).mockImplementation(
      (_modules, target) =>
        target.id === "SandBox"
          ? [
              {
                target,
                reason: "missing Native",
              } as unknown as vetypes.ModuleIssue,
            ]
          : [],
    );
    const manager = new LoadOrderManager(createApi());

    const result = await manager.validate(
      [],
      [entry("Native"), entry("SandBox")],
    );

    expect(result).toEqual({
      invalid: [{ id: "SandBox", reason: "rendered missing Native" }],
    });
  });
});

describe("deserializeLoadOrder", () => {
  it("cancels the read without an active Bannerlord profile", async () => {
    activateProfile("p1", "skyrimse");
    const manager = new LoadOrderManager(createApi());

    await expect(manager.deserializeLoadOrder()).rejects.toBeInstanceOf(
      util.ProcessCanceled,
    );
    expect(readLoadOrderAsync).not.toHaveBeenCalled();
  });

  it("cancels the read while the game folder is unknown", async () => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue(undefined);
    const manager = new LoadOrderManager(createApi());

    await expect(manager.deserializeLoadOrder()).rejects.toBeInstanceOf(
      util.ProcessCanceled,
    );
  });

  it("returns the ordered load order and passes it to the launcher", async () => {
    const loadOrder = [entry("Native")];
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync).mockResolvedValue(
      loadOrder,
    );
    const manager = new LoadOrderManager(createApi());

    await expect(manager.deserializeLoadOrder()).resolves.toBe(loadOrder);
    expect(launcherManager.refreshModulesAsync).toHaveBeenCalled();
    expect(launcherManager.setModulesToLaunchAsync).toHaveBeenCalledWith({
      Native: {
        id: "Native",
        name: "Native",
        isSelected: true,
        isDisabled: false,
        index: 0,
      },
    });
  });

  it("reads again when the game mode switched during the read", async () => {
    const singleplayer = [entry("SandBox")];
    const multiplayer = [entry("MPMod", { mode: "multiplayer" })];
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync)
      .mockImplementationOnce(async () => {
        gameMode = "multiplayer";
        return singleplayer;
      })
      .mockResolvedValueOnce(multiplayer);
    const manager = new LoadOrderManager(createApi());

    const result = await manager.deserializeLoadOrder();

    expect(result).toBe(multiplayer);
    expect(orderCurrentLoadOrderByExternalLoadOrderAsync).toHaveBeenCalledTimes(
      2,
    );
  });

  it("reads again when the profile switched during the read", async () => {
    const second = [entry("Native")];
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync)
      .mockImplementationOnce(async () => {
        activateProfile("p2");
        return [];
      })
      .mockResolvedValueOnce(second);
    const manager = new LoadOrderManager(createApi());

    await expect(manager.deserializeLoadOrder()).resolves.toBe(second);
  });

  it("gives up retrying after a few reads and returns a final read", async () => {
    let reads = 0;
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync).mockImplementation(
      async () => {
        reads++;
        gameMode = gameMode === "singleplayer" ? "multiplayer" : "singleplayer";
        return [entry(`read${reads}`)];
      },
    );
    const manager = new LoadOrderManager(createApi());

    const result = await manager.deserializeLoadOrder();

    expect(reads).toBe(4);
    expect(result.map((x) => x.id)).toEqual(["read4"]);
  });

  it("runs reads one at a time", async () => {
    let releaseFirst = (): void => undefined;
    const events: string[] = [];
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync)
      .mockImplementationOnce(async () => {
        events.push("first started");
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        events.push("first done");
        return [];
      })
      .mockImplementationOnce(async () => {
        events.push("second started");
        return [];
      });
    const manager = new LoadOrderManager(createApi());

    const first = manager.deserializeLoadOrder();
    const second = manager.deserializeLoadOrder();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(["first started"]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first started", "first done", "second started"]);
  });

  it("keeps reading after a failed read", async () => {
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync)
      .mockRejectedValueOnce(new Error("broken"))
      .mockResolvedValueOnce([entry("Native")]);
    const manager = new LoadOrderManager(createApi());

    await expect(manager.deserializeLoadOrder()).rejects.toThrow("broken");
    await expect(manager.deserializeLoadOrder()).resolves.toHaveLength(1);
  });

  it("checks a module for obfuscated binaries once and fills the unknown flag", async () => {
    vi.mocked(orderCurrentLoadOrderByExternalLoadOrderAsync).mockImplementation(
      async () => [
        entry("Unknown", { hasObfuscatedBinaries: null }),
        entry("Known", { hasObfuscatedBinaries: false }),
      ],
    );
    const manager = new LoadOrderManager(createApi());

    const first = await manager.deserializeLoadOrder();
    const second = await manager.deserializeLoadOrder();

    expect(first.map((x) => x.data?.hasObfuscatedBinaries)).toEqual([
      true,
      false,
    ]);
    expect(second[0]?.data?.hasObfuscatedBinaries).toBe(true);
    expect(launcherManager.isObfuscatedAsync).toHaveBeenCalledTimes(1);
  });
});

describe("getAvailableProviders", () => {
  it("lists every place a module was found", async () => {
    launcherManager.getAllModulesWithDuplicatesAsync.mockResolvedValue([
      module("Harmony"),
      {
        ...module("Harmony"),
        moduleProviderType: vetypes.ModuleProviderType.Steam,
      },
      {
        ...module("Other"),
        moduleProviderType: vetypes.ModuleProviderType.Vortex,
      },
    ]);
    const manager = new LoadOrderManager(createApi());
    await manager.deserializeLoadOrder();

    expect(manager.getAvailableProviders("Harmony")).toEqual([
      "Default",
      "Steam",
    ]);
    expect(manager.getAvailableProviders("Missing")).toEqual([]);
  });
});

describe("updateCompatibilityScoresAsync", () => {
  it("asks about the modules found, caches the scores and redraws the load order", async () => {
    const api = createApi();
    launcherManager.getAllModulesWithDuplicatesAsync.mockResolvedValue([
      {
        ...module("Bannerlord.Harmony"),
        version: {
          applicationVersionType: vetypes.ApplicationVersionType.Release,
          major: 2,
          minor: 3,
          revision: 0,
          changeSet: 0,
        },
      },
    ]);
    analyzeAsync.mockResolvedValue({
      modules: [
        {
          moduleId: "Bannerlord.Harmony",
          compatibility: 97,
          recommendedCompatibility: null,
          recommendedModuleVersion: null,
        },
      ],
    });
    const manager = new LoadOrderManager(api);
    await manager.deserializeLoadOrder();

    expect(manager.getCompatibilityInfo("Bannerlord.Harmony")).toBeUndefined();
    await manager.updateCompatibilityScoresAsync();

    expect(analyzeAsync).toHaveBeenCalledWith(api, {
      gameVersion: "v1.2.12.0",
      modules: [{ moduleId: "Bannerlord.Harmony", moduleVersion: "v2.3.0.0" }],
    });
    expect(manager.getCompatibilityInfo("Bannerlord.Harmony")).toEqual({
      score: 97,
      recommendedScore: null,
      recommendedVersion: null,
    });
    expect(api.store?.dispatch).toHaveBeenCalledWith({
      type: "SET_FB_FORCE_UPDATE",
      payload: { profileId: "p1" },
    });
  });
});

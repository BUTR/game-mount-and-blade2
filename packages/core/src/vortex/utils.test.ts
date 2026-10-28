import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { applyDiscovery, findGameAsync, setupAsync } from "./utils";
import {
  addBLSETools,
  addModdingKitTool,
  addOfficialCLITool,
  addOfficialLauncherTool,
  addOfficialMultiplayerCLITool,
} from "./tools";
import { recommendBLSEAsync } from "../blse/deploy";
import { ensureNativeLogger } from "../launcher/logger";
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from "../common";

const vortex = vi.hoisted(() => ({
  launchGameStore: vi.fn(() => Promise.resolve()),
  findByAppId: vi.fn(),
  setStore: vi.fn(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.util, {
    GameStoreHelper: {
      launchGameStore: vortex.launchGameStore,
      findByAppId: vortex.findByAppId,
    },
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("./tools", () => ({
  addBLSETools: vi.fn(),
  addModdingKitTool: vi.fn(),
  addOfficialCLITool: vi.fn(),
  addOfficialLauncherTool: vi.fn(),
  addOfficialMultiplayerCLITool: vi.fn(),
}));
vi.mock("../blse/deploy", () => ({
  recommendBLSEAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("../launcher/logger", () => ({ ensureNativeLogger: vi.fn() }));
vi.mock("../launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({ setStore: vortex.setStore }),
  },
}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const makeApi = () => {
  const api = { showErrorNotification: vi.fn() };
  return { api: api as unknown as types.IExtensionApi, ...api };
};

const discovery = (
  options: { path?: string; store?: string } = {},
): types.IDiscoveryResult => options as types.IDiscoveryResult;

const ALL_TOOLS = [
  addOfficialCLITool,
  addOfficialMultiplayerCLITool,
  addOfficialLauncherTool,
  addModdingKitTool,
  addBLSETools,
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyDiscovery", () => {
  it("adds every tool for the folder and tells the launcher manager the store", () => {
    const { api } = makeApi();
    const found = discovery({ path: "C:\\Game", store: "gog" });

    applyDiscovery(api, found);

    for (const add of ALL_TOOLS) {
      expect(add).toHaveBeenCalledWith(api, found);
    }
    expect(vortex.setStore).toHaveBeenCalledWith("gog");
  });

  it("leaves the launcher manager's store alone while the store isn't known", () => {
    applyDiscovery(makeApi().api, discovery({ path: "C:\\Game" }));

    expect(vortex.setStore).not.toHaveBeenCalled();
    expect(addBLSETools).toHaveBeenCalledTimes(1);
  });
});

describe("setupAsync", () => {
  it("needs the game's folder", async () => {
    await expect(
      setupAsync(makeApi().api, discovery({ store: "steam" })),
    ).rejects.toThrow("discovery.path");

    expect(ensureNativeLogger).not.toHaveBeenCalled();
    expect(addBLSETools).not.toHaveBeenCalled();
  });

  it("starts the native logger before anything that needs the native library", async () => {
    const { api } = makeApi();

    await setupAsync(api, discovery({ path: "C:\\Game", store: "gog" }));

    const loggerOrder =
      vi.mocked(ensureNativeLogger).mock.invocationCallOrder[0];
    for (const add of ALL_TOOLS) {
      expect(loggerOrder).toBeLessThan(
        vi.mocked(add).mock.invocationCallOrder[0]!,
      );
    }
    expect(loggerOrder).toBeLessThan(
      vi.mocked(recommendBLSEAsync).mock.invocationCallOrder[0]!,
    );
  });

  it("recommends BLSE for the folder", async () => {
    const { api } = makeApi();
    const found = discovery({ path: "C:\\Game", store: "gog" });

    await setupAsync(api, found);

    expect(recommendBLSEAsync).toHaveBeenCalledWith(api, found);
  });

  it("starts Steam in the background for the Steam version only", async () => {
    const { api } = makeApi();

    await setupAsync(api, discovery({ path: "C:\\Game", store: "steam" }));
    expect(vortex.launchGameStore).toHaveBeenCalledWith(
      api,
      "steam",
      undefined,
      true,
    );

    vortex.launchGameStore.mockClear();
    await setupAsync(api, discovery({ path: "C:\\Game", store: "gog" }));
    await setupAsync(api, discovery({ path: "C:\\Game" }));
    expect(vortex.launchGameStore).not.toHaveBeenCalled();
  });

  it("reports a Steam that won't start without failing the setup", async () => {
    const { api, showErrorNotification } = makeApi();
    const failure = new Error("steam.exe not found");
    vortex.launchGameStore.mockRejectedValueOnce(failure);

    await setupAsync(api, discovery({ path: "C:\\Game", store: "steam" }));

    expect(showErrorNotification).toHaveBeenCalledWith(
      "Failed to launch the game store",
      failure,
    );
  });
});

describe("findGameAsync", () => {
  it("asks every store for the game by its id there", async () => {
    const entry = { gamePath: "C:\\Game", gameStoreId: "gog" };
    vortex.findByAppId.mockResolvedValueOnce(entry);

    await expect(findGameAsync()).resolves.toBe(entry);

    expect(vortex.findByAppId).toHaveBeenCalledWith([
      EPICAPP_ID,
      String(STEAMAPP_ID),
      ...GOG_IDS,
      XBOX_ID,
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { watchGameDiscovery } from "./discoveryWatcher";
import { applyDiscovery } from "./utils";
import { applyGameModeTools } from "./gameModeTools";
import { recommendBLSEAsync } from "../blse/deploy";
import { GAME_ID } from "../common";

const launcher = vi.hoisted(() => ({
  refreshModulesAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  type State = { activeGameId: string; discovery?: unknown };
  Object.assign(api.selectors, {
    activeGameId: (state: State) => state.activeGameId,
    discoveryByGame: (state: State) => state.discovery,
  });
  return api;
});
vi.mock("./utils", () => ({ applyDiscovery: vi.fn() }));
vi.mock("./gameModeTools", () => ({ applyGameModeTools: vi.fn() }));
vi.mock("../blse/deploy", () => ({
  recommendBLSEAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("../launcher/manager", () => ({
  VortexLauncherManager: { getInstance: () => launcher },
}));

const setup = (discovery: Record<string, unknown>, activeGameId = GAME_ID) => {
  let state = { activeGameId, discovery };
  let handler: (() => void) | undefined;
  const api = {
    getState: () => state,
    onStateChange: (_path: string[], callback: () => void) => {
      handler = callback;
    },
  } as unknown as types.IExtensionApi;
  watchGameDiscovery(api);
  return {
    api,
    change: (next: Record<string, unknown>, nextGame = activeGameId) => {
      state = { activeGameId: nextGame, discovery: next };
      handler?.();
    },
  };
};

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("watchGameDiscovery", () => {
  it("applies the discovery again when the game's folder or store changes", () => {
    const { api, change } = setup({ path: "C:\\Steam", store: "steam" });

    change({ path: "C:\\GOG", store: "gog" });
    change({ path: "C:\\GOG", store: "xbox" });

    expect(applyDiscovery).toHaveBeenCalledTimes(2);
    expect(applyDiscovery).toHaveBeenLastCalledWith(api, {
      path: "C:\\GOG",
      store: "xbox",
    });
    expect(applyGameModeTools).toHaveBeenCalledTimes(2);
    expect(recommendBLSEAsync).toHaveBeenCalledTimes(2);
    expect(recommendBLSEAsync).toHaveBeenLastCalledWith(api, {
      path: "C:\\GOG",
      store: "xbox",
    });
    expect(launcher.refreshModulesAsync).toHaveBeenCalledTimes(2);
  });

  it("keeps watching when the BLSE check or the module read fails", async () => {
    vi.mocked(recommendBLSEAsync).mockRejectedValueOnce(new Error("no BLSE"));
    launcher.refreshModulesAsync.mockRejectedValueOnce(new Error("no folder"));
    const { change } = setup({ path: "C:\\Steam", store: "steam" });

    change({ path: "C:\\GOG", store: "gog" });
    await flushAsync();
    change({ path: "C:\\Epic", store: "epic" });

    expect(applyDiscovery).toHaveBeenCalledTimes(2);
    expect(launcher.refreshModulesAsync).toHaveBeenCalledTimes(2);
  });

  it("ignores changes that keep the folder and store, like added tools", () => {
    const { change } = setup({ path: "C:\\Steam", store: "steam" });

    change({ path: "C:\\Steam", store: "steam", tools: { a: {} } });

    expect(applyDiscovery).not.toHaveBeenCalled();
  });

  it("leaves a change while another game is managed to the next setup", () => {
    const { change } = setup({ path: "C:\\Steam", store: "steam" }, "skyrimse");

    change({ path: "C:\\GOG", store: "gog" });
    change({ path: "C:\\GOG", store: "gog" }, GAME_ID);

    expect(applyDiscovery).not.toHaveBeenCalled();
  });

  it("does nothing once the game has no folder, until one is picked again", () => {
    const { change } = setup({ path: "C:\\Steam", store: "steam" });

    change({});
    expect(applyDiscovery).not.toHaveBeenCalled();

    change({ path: "C:\\Steam", store: "steam" });
    expect(applyDiscovery).toHaveBeenCalledTimes(1);
  });
});

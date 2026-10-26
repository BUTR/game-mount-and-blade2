import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { getBannerCacheDir, watchBannerCaches } from "./bannerCaches";

const mocks = vi.hoisted(() => ({
  getVortexPath: vi.fn<(name: string) => string>(),
  discoveryByGame:
    vi.fn<
      (
        state: unknown,
        gameId: string,
      ) => { path?: string; store?: string } | undefined
    >(),
  resetBannerCachesAsync:
    vi.fn<(cacheDir: string | undefined) => Promise<void>>(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  return {
    ...original,
    util: { getVortexPath: mocks.getVortexPath },
    selectors: { discoveryByGame: mocks.discoveryByGame },
  };
});

vi.mock("@bannerlord/banner/worker", () => ({
  resetBannerCachesAsync: mocks.resetBannerCachesAsync,
}));

type Discovery = { path?: string; store?: string } | undefined;

const createApi = (initial: Discovery) => {
  let discovery = initial;
  let onChange: (() => void) | undefined;
  mocks.discoveryByGame.mockImplementation(() => discovery);
  const api = {
    getState: () => ({}),
    onStateChange: (statePath: string[], callback: () => void) => {
      expect(statePath).toEqual([
        "settings",
        "gameMode",
        "discovered",
        "mountandblade2bannerlord",
      ]);
      onChange = callback;
    },
  } as unknown as types.IExtensionApi;
  return {
    api,
    change: (next: Discovery): void => {
      discovery = next;
      onChange?.();
    },
  };
};

beforeEach(() => {
  mocks.getVortexPath.mockReset().mockReturnValue(path.join("C:", "userData"));
  mocks.discoveryByGame.mockReset();
  mocks.resetBannerCachesAsync.mockReset().mockResolvedValue(undefined);
});

describe("getBannerCacheDir", () => {
  it("is a folder of the game in Vortex's data folder", () => {
    expect(getBannerCacheDir()).toBe(
      path.join("C:", "userData", "mountandblade2bannerlord", "banner-icons"),
    );
    expect(mocks.getVortexPath).toHaveBeenCalledWith("userData");
  });

  it("is undefined without Vortex's data folder", () => {
    mocks.getVortexPath.mockImplementation(() => {
      throw new Error("not in Vortex");
    });

    expect(getBannerCacheDir()).toBeUndefined();
  });
});

describe("watchBannerCaches", () => {
  it("resets the caches when the game moves to another folder", () => {
    const { api, change } = createApi({ path: "D:/Game", store: "steam" });
    watchBannerCaches(api);

    change({ path: "E:/Game", store: "steam" });

    expect(mocks.resetBannerCachesAsync).toHaveBeenCalledExactlyOnceWith(
      getBannerCacheDir(),
    );
  });

  it("resets the caches when the game switches to another store's install", () => {
    const { api, change } = createApi({ path: "D:/Game", store: "steam" });
    watchBannerCaches(api);

    change({ path: "D:/Game", store: "xbox" });

    expect(mocks.resetBannerCachesAsync).toHaveBeenCalledOnce();
  });

  it("keeps the caches when the discovery changes in other ways", () => {
    const { api, change } = createApi({ path: "D:/Game", store: "steam" });
    watchBannerCaches(api);

    change({ path: "D:/Game", store: "steam" });

    expect(mocks.resetBannerCachesAsync).not.toHaveBeenCalled();
  });

  it("compares with the last discovery, resetting once per switch", () => {
    const { api, change } = createApi(undefined);
    watchBannerCaches(api);

    change({ path: "D:/Game", store: "steam" });
    change({ path: "D:/Game", store: "steam" });
    change(undefined);

    expect(mocks.resetBannerCachesAsync).toHaveBeenCalledTimes(2);
  });

  it("survives a failed reset", async () => {
    mocks.resetBannerCachesAsync.mockRejectedValue(new Error("locked"));
    const { api, change } = createApi({ path: "D:/Game" });
    watchBannerCaches(api);

    change({ path: "E:/Game" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.resetBannerCachesAsync).toHaveBeenCalledOnce();
  });
});

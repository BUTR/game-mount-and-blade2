import path from "path";
import { log, selectors, types, util } from "@nexusmods/vortex-api";
import { resetBannerCachesAsync } from "@bannerlord/banner/worker";
import { GAME_ID } from "@bannerlord/core/common";

/**
 * Where the icons drawn once are kept for the next sessions, see getCachedIconMomentsAsync. Undefined without
 * Vortex's data folder, then icons are decoded from the game's textures each session
 */
export const getBannerCacheDir = (): string | undefined => {
  try {
    return path.join(util.getVortexPath("userData"), GAME_ID, "banner-icons");
  } catch {
    return undefined;
  }
};

/**
 * Switching the game to another store's install, or another folder, changes the files banners are drawn from:
 * everything drawn so far is forgotten, in memory and on disk
 */
export const watchBannerCaches = (api: types.IExtensionApi): void => {
  const discoveryKey = (): string => {
    const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
    return `${discovery?.path ?? ""}|${discovery?.store ?? ""}`;
  };

  let last = discoveryKey();
  api.onStateChange?.(["settings", "gameMode", "discovered", GAME_ID], () => {
    const current = discoveryKey();
    if (current === last) {
      return;
    }
    last = current;
    resetBannerCachesAsync(getBannerCacheDir()).catch((err: unknown) =>
      log("warn", "Failed to clear the banner caches", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
};

import { clearBannerAssets, getBannerAssetsAsync } from "./assets";
import { purgeIconCacheAsync } from "./iconCache";
import {
  BannerShape,
  clearRecentIcons,
  getBannerPrimaryColor,
  renderBannerAsync,
} from "./render";
import { createWorkerClient } from "@bannerlord/worker/client";

/**
 * The file name of the worker next to the bundle, see rolldown.config.mjs
 */
export const BANNER_WORKER_FILE = "bannerWorker.js";
// The worker keeps the banner data and the recent icons, it's closed after this long without a banner to free them
const IDLE_MS = 5 * 60 * 1000;

interface IBannerJobBase {
  gamePath: string;
  /**
   * Module IDs or names in load order, the default order when undefined
   */
  moduleIds: readonly string[] | undefined;
  code: string;
}

export type BannerJob =
  | (IBannerJobBase & { kind: "render"; cacheDir: string | undefined })
  | (IBannerJobBase & { kind: "primaryColor" });

/**
 * A banner job on the calling thread, the worker runs it with its caches
 */
export const runBannerJobAsync = async (
  job: BannerJob,
): Promise<BannerShape[] | string | null> => {
  const assets = await getBannerAssetsAsync(
    job.gamePath,
    job.moduleIds ?? undefined,
  );
  return job.kind === "render"
    ? renderBannerAsync(
        assets,
        job.code,
        job.cacheDir !== undefined ? { cacheDir: job.cacheDir } : {},
      )
    : getBannerPrimaryColor(assets, job.code);
};

const worker = createWorkerClient(
  BANNER_WORKER_FILE,
  runBannerJobAsync,
  IDLE_MS,
);

/**
 * renderBannerAsync in the banner worker: loading the game's banner data and decoding icons is work the renderer
 * would do while it renders
 */
export const renderBannerInWorkerAsync = (
  gamePath: string,
  moduleIds: readonly string[] | undefined,
  code: string,
  cacheDir: string | undefined,
): Promise<BannerShape[] | null> =>
  worker.run({
    kind: "render",
    gamePath,
    moduleIds,
    code,
    cacheDir,
  }) as Promise<BannerShape[] | null>;

/**
 * getBannerPrimaryColor in the banner worker, it needs the game's banner data the worker already has
 */
export const getBannerPrimaryColorInWorkerAsync = (
  gamePath: string,
  moduleIds: readonly string[] | undefined,
  code: string,
): Promise<string | null> =>
  worker.run({
    kind: "primaryColor",
    gamePath,
    moduleIds,
    code,
  }) as Promise<string | null>;

/**
 * Forgets everything drawn so far: closes the worker, which drops what it keeps in memory, clears what the renderer
 * keeps when the worker can't run, and deletes the icons cached in `cacheDir`. For when the game's files change,
 * like switching to another store's install. Banners being drawn reject, the next ones are drawn from the new files
 */
export const resetBannerCachesAsync = async (
  cacheDir: string | undefined,
): Promise<void> => {
  worker.terminate();
  clearBannerAssets();
  clearRecentIcons();
  if (cacheDir !== undefined) {
    await purgeIconCacheAsync(cacheDir);
  }
};

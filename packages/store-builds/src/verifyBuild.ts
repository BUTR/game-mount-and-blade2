import { compareFiles, ICompareResult, listGameFilesAsync } from "./compare";
import { readEpicBuildAsync } from "./epic";
import { readGogBuildAsync } from "./gog";
import { readSteamBuildAsync } from "./steam";
import { IStoreBuild } from "./types";
import { loadUnmodifiedReaderAsync } from "./unmodified";
import {
  compareXboxPackageAsync,
  compareXboxRelatedPackagesAsync,
  IXboxPackageComparison,
  readXboxBuildAsync,
} from "./xbox";
import { runInWorkerAsync } from "@bannerlord/worker/client";

export type VerifyBuildStore = "steam" | "gog" | "epic" | "xbox";

export interface IVerifyBuildRequest {
  store: VerifyBuildStore;
  gamePath: string;
  /**
   * From getSteamPaths, read on the renderer: the registry can't be read in the worker
   */
  steamPaths: readonly string[];
  /**
   * From getEpicDataPath, read on the renderer as the Steam paths
   */
  epicDataPath: string | undefined;
  /**
   * From getXboxRelatedPackageRoots, read on the renderer as the Steam paths
   */
  xboxPackageRoots: readonly string[];
}

/**
 * The installed build and the game folder compared to it, without the build's file list, the worker sends it back
 */
export interface IVerifyBuildResult {
  buildId: string;
  /**
   * The game's version when the store tells it, see IStoreBuild
   */
  version?: string;
  productId: string;
  missingLists: string[];
  sizesKnown: boolean;
  /**
   * Whether files changed without a change of size are found, by Xbox's unmodified mark. Only sizes are compared
   * otherwise
   */
  contentsChecked: boolean;
  /**
   * Undefined when lists are missing, the folder isn't compared without them
   */
  comparison?: ICompareResult;
  /**
   * The packages installed with the game in folders of their own, Xbox's DLCs
   */
  packages: IXboxPackageComparison[];
}

/**
 * The file name of the worker next to the bundle, see rolldown.config.mjs
 */
export const VERIFY_WORKER_FILE = "verifyWorker.js";

const readBuildAsync = (request: IVerifyBuildRequest): Promise<IStoreBuild> => {
  switch (request.store) {
    case "steam":
      return readSteamBuildAsync(request.gamePath, request.steamPaths);
    case "gog":
      return readGogBuildAsync(request.gamePath);
    case "epic":
      return readEpicBuildAsync(request.gamePath, request.epicDataPath);
    case "xbox":
      return readXboxBuildAsync(request.gamePath);
  }
};

/**
 * Reads the store's list of the installed build and compares the game folder to it, on the calling thread
 */
export const verifyBuildAsync = async (
  request: IVerifyBuildRequest,
): Promise<IVerifyBuildResult> => {
  const build = await readBuildAsync(request);
  const result: IVerifyBuildResult = {
    buildId: build.buildId,
    ...(build.version !== undefined ? { version: build.version } : {}),
    productId: build.productId,
    missingLists: build.missingLists,
    sizesKnown: build.files.some((file) => file.size !== undefined),
    contentsChecked: false,
    packages: [],
  };
  if (build.missingLists.length > 0) {
    return result;
  }
  if (request.store !== "xbox") {
    return {
      ...result,
      comparison: compareFiles(
        build.files,
        await listGameFilesAsync(request.gamePath),
      ),
    };
  }

  const isUnmodified = await loadUnmodifiedReaderAsync();
  return {
    ...result,
    contentsChecked: isUnmodified !== undefined,
    comparison: await compareXboxPackageAsync(
      request.gamePath,
      build.files,
      isUnmodified,
    ),
    packages: await compareXboxRelatedPackagesAsync(
      request.gamePath,
      request.xboxPackageRoots,
      isUnmodified,
    ),
  };
};

/**
 * verifyBuildAsync in a Web Worker next to the bundle: parsing the lists, listing the folder and comparing is work
 * the renderer would do while it renders
 */
export const verifyBuildInWorkerAsync = (
  request: IVerifyBuildRequest,
): Promise<IVerifyBuildResult> =>
  runInWorkerAsync(VERIFY_WORKER_FILE, request, verifyBuildAsync);

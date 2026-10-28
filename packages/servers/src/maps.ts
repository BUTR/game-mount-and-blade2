import { util } from "@nexusmods/vortex-api";
import { USER_AGENT } from "@bannerlord/core/common";
import {
  downloadServerMapAsync as downloadMapAsync,
  ILocalScene,
  IMapArchiver,
  IMapDownloadProgress,
  InvalidMapError,
  NotDownloadedMapError,
  removeDownloadedMapAsync as removeMapAsync,
} from "@bannerlord/server-maps";
import { IServerAddress } from "@bannerlord/server-query/address";
import { IServerMap } from "@bannerlord/server-query/types";

// The map server always sends zip, forcing the type keeps 7-Zip from parsing anything else
const archiver: IMapArchiver = {
  list: (archive, onEntries) =>
    new util.SevenZip().list(archive, { t: "zip" }, onEntries),
  extractFull: (archive, target) =>
    new util.SevenZip().extractFull(archive, target, { t: "zip" }),
};

/**
 * Vortex's errors for what reporting a bug wouldn't fix
 */
const toVortexError = (err: unknown): unknown =>
  err instanceof InvalidMapError
    ? new util.DataInvalid(err.message)
    : err instanceof NotDownloadedMapError
      ? new util.ProcessCanceled(err.message)
      : err;

/**
 * Downloads a custom map into `Modules/Multiplayer/SceneObj` with Vortex's 7-Zip, replacing any older downloaded
 * version. Returns the target scene directory path.
 */
export const downloadServerMapAsync = async (
  gamePath: string,
  server: IServerAddress,
  map: IServerMap,
  onProgress: (progress: IMapDownloadProgress) => void = () => undefined,
): Promise<string> => {
  try {
    return await downloadMapAsync(gamePath, server, map, {
      userAgent: USER_AGENT,
      archiver,
      onProgress,
    });
  } catch (err) {
    throw toVortexError(err);
  }
};

/**
 * Removes a map from the shared download cache (`Modules/Multiplayer/SceneObj`).
 * Scenes belonging to other modules are preserved.
 */
export const removeDownloadedMapAsync = async (
  gamePath: string,
  scene: ILocalScene,
): Promise<void> => {
  try {
    await removeMapAsync(gamePath, scene);
  } catch (err) {
    throw toVortexError(err);
  }
};

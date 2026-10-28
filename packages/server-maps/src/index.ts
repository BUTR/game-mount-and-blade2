import { createWriteStream, promises as fs, WriteStream } from "fs";
import { get } from "http";
import os from "os";
import path from "path";
import { IServerMap } from "@bannerlord/server-query/types";
import {
  formatServerAddress,
  IServerAddress,
} from "@bannerlord/server-query/address";
import { MODULES, readModuleFoldersAsync } from "@bannerlord/game-layout";

/**
 * Custom maps hosted by a dedicated server in its Multiplayer module are served as zip archives
 * at /maps/list/{name} (`TaleWorlds.MountAndBlade.ListedServer.MapServer`).
 * Matching the game's internal downloader (`DedicatedCustomServerClientHelperSubModule.DownloadMapFromHost`),
 * archives are extracted to `Modules/Multiplayer/SceneObj/{scene}`, serving as a shared download cache
 * between the game client and this downloader.
 */
export const MAP_MODULE = "Multiplayer";
const SCENE_OBJ = "SceneObj";
const SCENE_FILE = "scene.xscene";
const SCENE_HEADER_BYTES = 4096;
// Matches the validation pattern enforced by the map server for map names.
const MAP_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

// The server archives the map on demand before responding (`InactiveArchivedMap.SaveZippedMap`), which can take considerable time for large maps.
// The game client downloader uses HttpClient's default timeout of 100 seconds.
const RESPONSE_TIMEOUT_MS = 120_000;
const IDLE_TIMEOUT_MS = 60_000;
// While an existing request is causing the server to zip the map, the server responds with HTTP 409 Conflict; retry until compression finishes.
const BUSY_RETRY_DELAY_MS = 3_000;
const BUSY_RETRY_LIMIT_MS = 180_000;
const PROGRESS_INTERVAL_MS = 250;
const MAX_MAP_BYTES = 4 * 1024 * 1024 * 1024;
// Limits for what a map archive unpacks to, a zip can unpack to far more than its download size
const MAX_EXTRACTED_BYTES = 16 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
// Room left on the game drive after extracting a map
const FREE_SPACE_MARGIN_BYTES = 256 * 1024 * 1024;
// Newly written files can be briefly locked by Windows background processes (e.g., antivirus scanners or the search indexer).
const LOCKED_ERROR_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
const LOCKED_RETRIES = 8;
const LOCKED_RETRY_DELAY_MS = 250;
// Temporary directory prefix used by downloadServerMapAsync before atomically moving the extracted map into place.
const TEMP_FOLDER_PREFIX = "temp_";

/**
 * Represents a scene located in the game directory. Custom scenes specify `unique_token` and `revision` attributes
 * on the root element of `scene.xscene` for version verification; official scenes omit these attributes.
 */
export interface ILocalScene {
  name: string;
  module: string;
  path: string;
  uniqueToken: string | null;
  revision: string | null;
}

/**
 * Map of lowercase scene names to their local scene definitions, mirroring the game's lookup behavior.
 * Multiple modules may provide a scene with the same name.
 */
export type LocalScenes = Map<string, ILocalScene[]>;

/**
 * Server map installation states:
 * - installed: A local scene matches the server's map version.
 * - outdated: Only a downloaded cached copy exists and differs from the server version; re-downloading will replace it.
 * - conflict: Another module provides a differing version of the scene; downloading would introduce an ambiguous duplicate.
 * - missing: No local copy exists.
 */
export type ServerMapState = "installed" | "outdated" | "conflict" | "missing";

export interface IServerMapStatus {
  map: IServerMap;
  state: ServerMapState;
  local: ILocalScene[];
}

/**
 * Stages of map download and installation:
 * - queued: Awaiting prior map operations in the download queue.
 * - preparing: Waiting for the server to compress the map archive.
 * - downloading: Actively streaming the map archive payload.
 * - installing: Extracting the archive and moving it into `SceneObj`.
 */
export type MapDownloadStage =
  | "queued"
  | "preparing"
  | "downloading"
  | "installing";

export interface IMapDownloadProgress {
  stage: MapDownloadStage;
  receivedBytes: number;
  totalBytes: number | null;
}

/**
 * The map or its archive can't be installed: a name the server shouldn't send, or an archive that isn't a map
 */
export class InvalidMapError extends Error {}

/**
 * The scene isn't one the download cache holds, so it isn't removed
 */
export class NotDownloadedMapError extends Error {}

/**
 * A file in a zip archive as the archiver lists it
 */
export interface IMapArchiveEntry {
  name: string;
  size?: number;
  /**
   * Its attributes as 7-Zip lists them, as text (lrwxrwxrwx) or as hex with the Unix mode in the high 16 bits
   */
  attr?: string;
}

/**
 * Lists and extracts the zip archives maps are served as
 */
export interface IMapArchiver {
  list(
    archive: string,
    onEntries: (entries: IMapArchiveEntry[]) => void,
  ): Promise<void>;
  extractFull(archive: string, target: string): Promise<void>;
}

export interface IMapDownloadOptions {
  /**
   * Sent as the User-Agent header
   */
  userAgent: string;
  archiver: IMapArchiver;
  onProgress?: (progress: IMapDownloadProgress) => void;
}

const BYTE_LABELS = ["B", "KB", "MB", "GB", "TB"];

/**
 * A size the way Vortex shows one
 */
const bytesToString = (bytes: number): string => {
  let labelIndex = 0;
  while (bytes >= 1024) {
    ++labelIndex;
    bytes /= 1024;
  }
  return `${bytes.toFixed(Math.max(0, labelIndex - 1))} ${BYTE_LABELS[labelIndex]}`;
};

export const createMapDownloadProgress = (
  stage: MapDownloadStage,
): IMapDownloadProgress => ({ stage, receivedBytes: 0, totalBytes: null });

export const isValidMapName = (name: string): boolean =>
  MAP_NAME_PATTERN.test(name);

export const getDownloadedMapsPath = (gamePath: string): string =>
  path.join(gamePath, MODULES, MAP_MODULE, SCENE_OBJ);

/**
 * Parses the root `<scene>` element attributes from the start of a `scene.xscene` file.
 */
export const parseSceneHeader = (
  header: string,
): Pick<ILocalScene, "uniqueToken" | "revision"> | null => {
  const root = /<scene\b[^>]*>/.exec(header)?.[0];
  if (root === undefined) {
    return null;
  }
  const attribute = (name: string): string | null =>
    new RegExp(`\\b${name}="([^"]*)"`).exec(root)?.[1] ?? null;
  return {
    uniqueToken: attribute("unique_token"),
    revision: attribute("revision"),
  };
};

const readSceneHeaderAsync = async (file: string): Promise<string | null> => {
  const handle = await fs.open(file, "r").catch(() => null);
  if (handle === null) {
    return null;
  }
  try {
    const buffer = Buffer.alloc(SCENE_HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SCENE_HEADER_BYTES, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
};

const readModuleScenesAsync = async (
  modulesPath: string,
  module: string,
): Promise<ILocalScene[]> => {
  const sceneObj = path.join(modulesPath, module, SCENE_OBJ);
  const entries = await fs
    .readdir(sceneObj, { withFileTypes: true })
    .catch(() => []);
  const scenes = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !(
            module.toLowerCase() === MAP_MODULE.toLowerCase() &&
            entry.name.startsWith(TEMP_FOLDER_PREFIX)
          ),
      )
      .map(async (entry): Promise<ILocalScene | null> => {
        const scenePath = path.join(sceneObj, entry.name);
        const header = await readSceneHeaderAsync(
          path.join(scenePath, SCENE_FILE),
        );
        const identifiers = header !== null ? parseSceneHeader(header) : null;
        if (identifiers === null) {
          return null;
        }
        return {
          name: entry.name,
          module,
          path: scenePath,
          ...identifiers,
        };
      }),
  );
  return scenes.filter((scene) => scene !== null);
};

const addScenes = (scenes: LocalScenes, added: ILocalScene[]): void => {
  for (const scene of added) {
    const key = scene.name.toLowerCase();
    scenes.set(key, [...(scenes.get(key) ?? []), scene]);
  }
};

/**
 * Discovers scenes across all installed game modules.
 * Scans several hundred scene descriptor files across modules; use `readDownloadedScenesAsync`
 * when only the shared download cache needs to be queried.
 *
 * @param downloaded the download cache's scenes when they were just read, so that folder isn't read again
 */
export const readLocalScenesAsync = async (
  gamePath: string,
  downloaded?: ILocalScene[],
): Promise<LocalScenes> => {
  const scenes: LocalScenes = new Map();
  const modulesPath = path.join(gamePath, MODULES);
  const modules = await readModuleFoldersAsync(gamePath);
  const moduleScenes = await Promise.all(
    modules.map((module) =>
      downloaded !== undefined &&
      module.toLowerCase() === MAP_MODULE.toLowerCase()
        ? downloaded
        : readModuleScenesAsync(modulesPath, module),
    ),
  );
  for (const added of moduleScenes) {
    addScenes(scenes, added);
  }
  return scenes;
};

/**
 * Reads scenes currently present in the shared download cache (`Modules/Multiplayer/SceneObj`).
 */
export const readDownloadedScenesAsync = (
  gamePath: string,
): Promise<ILocalScene[]> =>
  readModuleScenesAsync(path.join(gamePath, MODULES), MAP_MODULE);

/**
 * Returns an updated scene map replacing cached download scenes while preserving discovered scenes from other modules.
 */
export const withDownloadedScenes = (
  localScenes: LocalScenes | null,
  downloaded: ILocalScene[],
): LocalScenes => {
  const scenes: LocalScenes = new Map();
  for (const [key, entries] of localScenes ?? []) {
    const kept = entries.filter((scene) => !isDownloadedScene(scene));
    if (kept.length > 0) {
      scenes.set(key, kept);
    }
  }
  addScenes(scenes, downloaded);
  return scenes;
};

/**
 * Matches scene equivalence using the game's verification rules (`MapCheckHelpers.DoesSceneExist`):
 * if the server publishes a map without identifiers, it matches by name;
 * otherwise, both `unique_token` and `revision` must match exactly.
 */
export const matchesServerMap = (
  map: IServerMap,
  scene: Pick<ILocalScene, "uniqueToken" | "revision">,
): boolean =>
  map.uniqueToken === null ||
  (scene.uniqueToken === map.uniqueToken && scene.revision === map.revision);

const isDownloadedScene = (scene: ILocalScene): boolean =>
  scene.module.toLowerCase() === MAP_MODULE.toLowerCase();

export const getServerMapStatuses = (
  maps: IServerMap[],
  localScenes: LocalScenes | null,
): IServerMapStatus[] =>
  maps.map((map) => {
    const local = localScenes?.get(map.name.toLowerCase()) ?? [];
    const state: ServerMapState =
      local.length === 0
        ? "missing"
        : local.some((scene) => matchesServerMap(map, scene))
          ? "installed"
          : local.every(isDownloadedScene)
            ? "outdated"
            : "conflict";
    return { map, state, local };
  });

/**
 * Retrieves all maps located in the shared download cache (`Modules/Multiplayer/SceneObj`), sorted alphabetically by name.
 */
export const getDownloadedMaps = (
  localScenes: LocalScenes | null,
): ILocalScene[] =>
  [...(localScenes?.values() ?? [])]
    .flat()
    .filter(isDownloadedScene)
    .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name));

export const getFolderSizeAsync = async (folder: string): Promise<number> => {
  const entries = await fs
    .readdir(folder, { withFileTypes: true })
    .catch(() => []);
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        return getFolderSizeAsync(entryPath);
      }
      return (await fs.stat(entryPath).catch(() => null))?.size ?? 0;
    }),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
};

const randomId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const delayAsync = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isLockedError = (err: unknown): boolean =>
  LOCKED_ERROR_CODES.has((err as NodeJS.ErrnoException | null)?.code ?? "");

const retryWhileLockedAsync = async (
  action: () => Promise<void>,
): Promise<void> => {
  for (let attempt = 1; ; attempt++) {
    try {
      await action();
      return;
    } catch (err) {
      if (attempt >= LOCKED_RETRIES || !isLockedError(err)) {
        throw err;
      }
      await delayAsync(LOCKED_RETRY_DELAY_MS * attempt);
    }
  }
};

const removeFolderAsync = (folder: string): Promise<void> =>
  fs.rm(folder, {
    recursive: true,
    force: true,
    maxRetries: LOCKED_RETRIES,
    retryDelay: LOCKED_RETRY_DELAY_MS,
  });

/**
 * Thrown when the server responds with HTTP 409 Conflict, indicating it is currently compressing the requested map.
 */
class MapBusyError extends Error {}

/**
 * Streams `/maps/list/{name}` to a temporary file.
 * The server compresses the map before sending headers, so initial responses can be delayed.
 * Uses a non-pooled connection to avoid stale socket resets during long compression pauses.
 */
const requestMapAsync = (
  server: IServerAddress,
  mapName: string,
  target: string,
  userAgent: string,
  onProgress: (progress: IMapDownloadProgress) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;
    let responded = false;
    let file: WriteStream | null = null;

    // Close the file stream before rejecting so callers can cleanly remove the file on Windows.
    const fail = (err: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      request.destroy();
      if (file !== null && !file.closed) {
        file.once("close", () => reject(err));
        file.destroy();
      } else {
        reject(err);
      }
    };

    const request = get(
      {
        host: server.address,
        port: server.port,
        path: `/maps/list/${mapName}`,
        agent: false,
        timeout: RESPONSE_TIMEOUT_MS,
        headers: {
          "User-Agent": userAgent,
        },
      },
      (response) => {
        responded = true;
        if (response.statusCode === 409) {
          response.resume();
          fail(
            new MapBusyError(
              "The server is still preparing this map. Please try again in a moment.",
            ),
          );
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          fail(
            new Error(`The server responded with HTTP ${response.statusCode}`),
          );
          return;
        }

        const length = Number(response.headers["content-length"]);
        const totalBytes =
          Number.isFinite(length) && length > 0 ? length : null;
        if (totalBytes !== null && totalBytes > MAX_MAP_BYTES) {
          fail(new Error("The map is too large"));
          return;
        }

        request.setTimeout(IDLE_TIMEOUT_MS);
        let receivedBytes = 0;
        let reportedAt = 0;
        let written = false;
        onProgress({ stage: "downloading", receivedBytes, totalBytes });

        const output = createWriteStream(target);
        file = output;
        response.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_MAP_BYTES) {
            fail(new Error("The map is too large"));
            return;
          }
          // Throttle progress updates to avoid excessive UI re-renders on high-frequency chunks.
          const now = Date.now();
          if (now - reportedAt >= PROGRESS_INTERVAL_MS) {
            reportedAt = now;
            onProgress({ stage: "downloading", receivedBytes, totalBytes });
          }
        });
        response.on("error", fail);
        response.on("close", () => {
          if (!response.complete) {
            fail(
              new Error(
                "The server closed the connection before the map was complete",
              ),
            );
          }
        });
        output.on("error", fail);
        output.on("finish", () => {
          if (
            !response.complete ||
            (totalBytes !== null && receivedBytes !== totalBytes)
          ) {
            fail(
              new Error(
                "The server closed the connection before the map was complete",
              ),
            );
            return;
          }
          written = true;
          onProgress({ stage: "downloading", receivedBytes, totalBytes });
        });
        output.on("close", () => {
          if (written && !settled) {
            settled = true;
            resolve();
          }
        });
        response.pipe(output);
      },
    );
    request.on("timeout", () =>
      fail(
        new Error(
          responded
            ? "The server stopped sending the map"
            : "The server took too long to prepare the map",
        ),
      ),
    );
    request.on("error", fail);
  });

/**
 * Downloads the map archive to a file, retrying while the server reports HTTP 409 Conflict (busy compressing).
 */
const downloadToFileAsync = async (
  server: IServerAddress,
  mapName: string,
  target: string,
  userAgent: string,
  onProgress: (progress: IMapDownloadProgress) => void,
): Promise<void> => {
  const giveUpAt = Date.now() + BUSY_RETRY_LIMIT_MS;
  for (;;) {
    onProgress(createMapDownloadProgress("preparing"));
    try {
      await requestMapAsync(server, mapName, target, userAgent, onProgress);
      return;
    } catch (err) {
      if (!(err instanceof MapBusyError) || Date.now() >= giveUpAt) {
        throw err;
      }
    }
    await delayAsync(BUSY_RETRY_DELAY_MS);
  }
};

/**
 * Reads the canonical scene name attribute from `scene.xscene`, matching the game client downloader directory naming convention.
 */
const readSceneNameAsync = async (folder: string): Promise<string | null> => {
  const header = await readSceneHeaderAsync(path.join(folder, SCENE_FILE));
  return header !== null
    ? (/<scene\b[^>]*\bname="([^"]+)"/.exec(header)?.[1] ?? null)
    : null;
};

// Attributes as text (lrwxrwxrwx) or as hex with the Unix mode in the high 16 bits
const UNIX_ATTRIBUTES_PATTERN = /(?:^|\s)([0-9A-F]{8})$/i;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_SYMLINK = 0o120000;

const isSymlinkEntry = (attr: string | undefined): boolean => {
  if (attr === undefined) {
    return false;
  }
  if (/(?:^|\s)l[rwxsStT-]{9}$/.test(attr)) {
    return true;
  }
  const hex = UNIX_ATTRIBUTES_PATTERN.exec(attr)?.[1];
  return (
    hex !== undefined &&
    ((parseInt(hex, 16) >>> 16) & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK
  );
};

/**
 * Entries must stay inside the extraction folder. 7-Zip already sanitizes these, older builds did not
 */
const isUnsafeEntryName = (name: string): boolean =>
  path.isAbsolute(name) ||
  /^[A-Za-z]:/.test(name) ||
  name.split(/[\\/]/).includes("..");

/**
 * Checks the listing of a downloaded map archive before extracting it. A zip can unpack to far more than its download
 * size, so the declared sizes must fit the limit and the drive, and no entry may be a link or point outside the folder
 */
const checkMapArchiveAsync = async (
  archiver: IMapArchiver,
  archive: string,
  targetFolder: string,
  server: IServerAddress,
): Promise<void> => {
  const source = formatServerAddress(server);
  let totalBytes = 0;
  let entryCount = 0;
  let rejected: string | null = null;
  await archiver.list(archive, (entries) => {
    for (const entry of entries) {
      entryCount++;
      if (entry.size === undefined || !Number.isSafeInteger(entry.size)) {
        rejected ??= `'${entry.name}' has no size`;
        continue;
      }
      totalBytes += entry.size;
      if (isUnsafeEntryName(entry.name)) {
        rejected ??= `'${entry.name}' points outside the map folder`;
      } else if (isSymlinkEntry(entry.attr)) {
        rejected ??= `'${entry.name}' is a link`;
      }
    }
  });

  if (rejected !== null) {
    throw new InvalidMapError(
      `The map archive from ${source} was not extracted: ${rejected}`,
    );
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new InvalidMapError(
      `The map archive from ${source} contains too many files (${entryCount})`,
    );
  }
  if (totalBytes > MAX_EXTRACTED_BYTES) {
    throw new InvalidMapError(
      `The map archive from ${source} is too large when extracted (${bytesToString(totalBytes)})`,
    );
  }
  const { bavail, bsize } = await fs.statfs(targetFolder);
  if (totalBytes + FREE_SPACE_MARGIN_BYTES > bavail * bsize) {
    throw new Error(
      `The map requires ${bytesToString(totalBytes)} of disk space, which exceeds the available free space in ${targetFolder}`,
    );
  }
};

/**
 * Downloads a custom map into `Modules/Multiplayer/SceneObj`, replacing any older downloaded version.
 * Returns the target scene directory path.
 */
export const downloadServerMapAsync = async (
  gamePath: string,
  server: IServerAddress,
  map: IServerMap,
  options: IMapDownloadOptions,
): Promise<string> => {
  const { userAgent, archiver, onProgress = () => undefined } = options;
  if (!isValidMapName(map.name)) {
    throw new InvalidMapError(`'${map.name}' is not a valid map name`);
  }

  const sceneObj = getDownloadedMapsPath(gamePath);
  await fs.mkdir(sceneObj, { recursive: true });

  const id = randomId();
  const archive = path.join(os.tmpdir(), `BL_map_dl_${map.name}_${id}.zip`);
  // Extract onto the target drive so moving it into place performs an atomic same-drive rename.
  const extracted = path.join(sceneObj, `${TEMP_FOLDER_PREFIX}${id}`);
  try {
    await downloadToFileAsync(server, map.name, archive, userAgent, onProgress);
    onProgress(createMapDownloadProgress("installing"));
    await checkMapArchiveAsync(archiver, archive, sceneObj, server);
    await archiver.extractFull(archive, extracted);

    const sceneName = await readSceneNameAsync(extracted);
    if (sceneName === null || !isValidMapName(sceneName)) {
      throw new InvalidMapError(
        `The archive from ${formatServerAddress(server)} has no valid scene in scene.xscene`,
      );
    }

    const target = path.join(sceneObj, sceneName);
    await removeFolderAsync(target);
    await retryWhileLockedAsync(() => fs.rename(extracted, target));
    return target;
  } finally {
    await fs.rm(archive, { force: true }).catch(() => undefined);
    await removeFolderAsync(extracted).catch(() => undefined);
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
  const sceneObj = getDownloadedMapsPath(gamePath);
  const resolved = path.resolve(scene.path);
  if (
    !isDownloadedScene(scene) ||
    path.dirname(resolved).toLowerCase() !==
      path.resolve(sceneObj).toLowerCase()
  ) {
    throw new NotDownloadedMapError(
      `'${scene.name}' is not a downloaded map and was not removed`,
    );
  }
  await fs.rm(resolved, { recursive: true, force: true });
};

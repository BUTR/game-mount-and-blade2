import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { deflateRaw, inflateRaw } from "zlib";
import { IBannerTextureSource } from "./assets";
import { ATLAS_CELLS, ICON_RESOLUTION, MOMENT_CHANNELS } from "./iconMoments";
import type { IconMoments } from "./iconMoments";

/**
 * The icons' moments packed in one file, filled in as icons are first drawn, so their textures, megabytes
 * decompressed, aren't read or decoded again. Each icon is compressed, about 21 KB instead of 160 KB, and the index
 * next to it has where. The cache is of one install of the game as it is: another install, like another store's,
 * or an update of its texture packages, starts it over, the textures may differ
 */
const DATA_FILE = "icons.bin";
const INDEX_FILE = "icons.json";
const FORMAT = 1;
const CELLS = ATLAS_CELLS * ATLAS_CELLS;
const MOMENT_VALUES = MOMENT_CHANNELS * ICON_RESOLUTION * ICON_RESOLUTION;

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);

interface IIconIndex {
  format: number;
  resolution: number;
  channels: number;
  /**
   * The folder of the texture packages the icons are of, undefined before the first icon
   */
  packagesFolder: string | undefined;
  /**
   * Those packages as they were when the icons were cached, by file name
   */
  packages: Record<string, { size: number; mtimeMs: number }>;
  /**
   * Each icon's offset and length in the data file, by texture GUID and cell
   */
  icons: Record<string, [offset: number, length: number]>;
  /**
   * The bytes of the data file the icons use. After it, a write that was cut short, the next icon goes over it
   */
  dataSize: number;
}

const emptyIndex = (): IIconIndex => ({
  format: FORMAT,
  resolution: ICON_RESOLUTION,
  channels: MOMENT_CHANNELS,
  packagesFolder: undefined,
  packages: {},
  icons: {},
  dataSize: 0,
});

const readIndexAsync = async (cacheDir: string): Promise<IIconIndex> => {
  try {
    const index = JSON.parse(
      await fs.readFile(path.join(cacheDir, INDEX_FILE), "utf8"),
    ) as IIconIndex;
    return index.format === FORMAT &&
      index.resolution === ICON_RESOLUTION &&
      index.channels === MOMENT_CHANNELS &&
      typeof index.dataSize === "number"
      ? index
      : emptyIndex();
  } catch {
    return emptyIndex();
  }
};

/**
 * Replaced whole: a crash leaves the old index, whose icons are all in the data file
 */
const writeIndexAsync = async (
  cacheDir: string,
  index: IIconIndex,
): Promise<void> => {
  const indexPath = path.join(cacheDir, INDEX_FILE);
  await fs.writeFile(`${indexPath}.tmp`, JSON.stringify(index), "utf8");
  await fs.rename(`${indexPath}.tmp`, indexPath);
};

interface ICache {
  index: IIconIndex;
  // The packages checked against the index this session
  checked: Set<string>;
  // One change of the files at a time
  queue: Promise<unknown>;
}

const caches = new Map<string, Promise<ICache>>();

const getCacheAsync = (cacheDir: string): Promise<ICache> => {
  let cache = caches.get(cacheDir);
  if (cache === undefined) {
    cache = fs
      .mkdir(cacheDir, { recursive: true })
      .then(() => readIndexAsync(cacheDir))
      .then((index) => ({
        index,
        checked: new Set<string>(),
        queue: Promise.resolve(),
      }));
    caches.set(cacheDir, cache);
  }
  return cache;
};

const serialize = <T>(cache: ICache, run: () => Promise<T>): Promise<T> => {
  const next = cache.queue.then(run, run);
  cache.queue = next.catch(() => undefined);
  return next;
};

/**
 * Starts the cache over when the package is of another install than the icons, or changed since they were cached
 */
const checkPackageAsync = async (
  cacheDir: string,
  cache: ICache,
  packagePath: string,
): Promise<void> => {
  if (cache.checked.has(packagePath)) {
    return;
  }
  const stat = await fs.stat(packagePath);
  const folder = path.dirname(packagePath).toLowerCase();
  const name = path.basename(packagePath).toLowerCase();
  const recorded = cache.index.packages[name];
  const otherInstall =
    cache.index.packagesFolder !== undefined &&
    cache.index.packagesFolder !== folder;
  const changed =
    recorded !== undefined &&
    (recorded.size !== stat.size || recorded.mtimeMs !== stat.mtimeMs);
  if (otherInstall || changed) {
    cache.index = emptyIndex();
    cache.checked.clear();
    await fs.truncate(path.join(cacheDir, DATA_FILE), 0).catch(() => undefined);
  }
  if (
    cache.index.packagesFolder === undefined ||
    cache.index.packages[name] === undefined
  ) {
    cache.index.packagesFolder = folder;
    cache.index.packages[name] = { size: stat.size, mtimeMs: stat.mtimeMs };
    await writeIndexAsync(cacheDir, cache.index);
  }
  cache.checked.add(packagePath);
};

const readIconAsync = async (
  cacheDir: string,
  [offset, length]: [number, number],
): Promise<IconMoments | undefined> => {
  const file = await fs.open(path.join(cacheDir, DATA_FILE), "r");
  try {
    const compressed = Buffer.alloc(length);
    const { bytesRead } = await file.read(compressed, 0, length, offset);
    if (bytesRead !== length) {
      return undefined;
    }
    const bytes = await inflateRawAsync(compressed);
    if (bytes.length !== MOMENT_VALUES * Uint16Array.BYTES_PER_ELEMENT) {
      return undefined;
    }
    // Its own buffer: a Uint16Array needs an aligned offset, Node's pooled buffers may not have one
    const moments = new Uint16Array(MOMENT_VALUES);
    Buffer.from(moments.buffer).set(bytes);
    return moments;
  } finally {
    await file.close();
  }
};

/**
 * The moments of an icon texture's cell from the cache in `cacheDir`, computed and kept there the first time.
 * Any failure of the cache only means computing them
 */
export const getCachedIconMomentsAsync = async (
  cacheDir: string,
  source: IBannerTextureSource,
  cell: number,
  computeAsync: () => Promise<IconMoments | null>,
): Promise<IconMoments | null> => {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) {
    return computeAsync();
  }
  let cache: ICache;
  try {
    cache = await getCacheAsync(cacheDir);
  } catch {
    return computeAsync();
  }
  const key = `${source.guid}:${cell}`;

  const cached = await serialize(cache, async () => {
    await checkPackageAsync(cacheDir, cache, source.filePath);
    const entry = cache.index.icons[key];
    return entry !== undefined ? readIconAsync(cacheDir, entry) : undefined;
  }).catch(() => undefined);
  if (cached !== undefined) {
    return cached;
  }

  const moments = await computeAsync();
  if (moments === null) {
    return null;
  }
  await serialize(cache, async () => {
    const compressed = await deflateRawAsync(
      Buffer.from(moments.buffer, moments.byteOffset, moments.byteLength),
    );
    const offset = cache.index.dataSize;
    const dataPath = path.join(cacheDir, DATA_FILE);
    // Positional writes need r+, w+ creates the file
    const file = await fs
      .open(dataPath, "r+")
      .catch(() => fs.open(dataPath, "w+"));
    try {
      await file.write(compressed, 0, compressed.length, offset);
    } finally {
      await file.close();
    }
    // The data first, then the index that points at it
    cache.index.icons[key] = [offset, compressed.length];
    cache.index.dataSize = offset + compressed.length;
    await writeIndexAsync(cacheDir, cache.index);
  }).catch(() => undefined);
  return moments;
};

/**
 * Deletes the cache in `cacheDir`, like when the game changed to another store's install
 */
export const purgeIconCacheAsync = async (cacheDir: string): Promise<void> => {
  caches.delete(cacheDir);
  for (const file of [DATA_FILE, INDEX_FILE, `${INDEX_FILE}.tmp`]) {
    await fs.rm(path.join(cacheDir, file), { force: true });
  }
};

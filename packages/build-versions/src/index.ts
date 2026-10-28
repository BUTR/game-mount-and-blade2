import { promises as fs } from "fs";
import path from "path";

/**
 * BUTR's registry of the game's builds: each version and changeset with its Steam and GOG build ids
 */
const BUILDS_URL =
  "https://raw.githubusercontent.com/BUTR/Bannerlord.ReferenceAssemblies/master/builds/links.json";
// A build the registry doesn't list yet would download it on every lookup, not more often than this
const MISS_REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

interface IBuildLink {
  version: string;
  changeSet: number;
  steam?: number[];
  gog?: string[];
}

interface IBuildLinks {
  builds: IBuildLink[];
}

const isBuildLinks = (value: unknown): value is IBuildLinks =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as IBuildLinks).builds);

/**
 * The stores whose builds the registry lists
 */
export type BuildStore = "steam" | "gog";

export interface IBuildVersionOptions {
  /**
   * Where the registry as last downloaded is kept. It's read first, GitHub only refreshes it
   */
  cachePath: string;
}

const readCacheAsync = async (
  cachePath: string,
): Promise<IBuildLinks | undefined> => {
  try {
    const cached: unknown = JSON.parse(await fs.readFile(cachePath, "utf8"));
    return isBuildLinks(cached) ? cached : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The registry from GitHub, kept in the cache file. Undefined when it can't be downloaded
 */
const downloadAsync = async (
  cachePath: string,
): Promise<IBuildLinks | undefined> => {
  try {
    const response = await fetch(BUILDS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return undefined;
    }
    const links: unknown = await response.json();
    if (!isBuildLinks(links)) {
      return undefined;
    }
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(links), "utf8");
    return links;
  } catch {
    // Offline
    return undefined;
  }
};

// The registry as last read, from the cache file or GitHub
let links: IBuildLinks | undefined;
// When GitHub was last asked, this session
let downloadedAt = 0;
let download: Promise<IBuildLinks | undefined> | null = null;

const getCachedLinksAsync = async (
  cachePath: string,
): Promise<IBuildLinks | undefined> => {
  links ??= await readCacheAsync(cachePath);
  return links;
};

/**
 * Downloads the registry once at a time, keeping it when it was downloaded
 */
const refreshLinksAsync = (
  cachePath: string,
): Promise<IBuildLinks | undefined> => {
  download ??= downloadAsync(cachePath)
    .then((downloaded) => {
      links = downloaded ?? links;
      return downloaded;
    })
    .finally(() => {
      downloadedAt = Date.now();
      download = null;
    });
  return download;
};

/**
 * The game's version with its changeset, like v1.4.8.119303, as the game shows it
 */
export const formatVersion = (version: string, changeSet: number): string =>
  `${version}.${changeSet}`;

/**
 * The game version of a store's build, from BUTR's registry. Undefined for a build it doesn't know yet
 */
export const getBuildVersionAsync = async (
  store: BuildStore,
  buildId: string,
  options: IBuildVersionOptions,
): Promise<string | undefined> => {
  const find = (registry: IBuildLinks | undefined): IBuildLink | undefined =>
    registry?.builds.find((candidate) =>
      store === "steam"
        ? candidate.steam?.some((id) => `${id}` === buildId) === true
        : candidate.gog?.includes(buildId) === true,
    );

  // A build's version doesn't change, the registry is downloaded only for a build newer than the cache file
  let build = find(await getCachedLinksAsync(options.cachePath));
  if (build === undefined && Date.now() - downloadedAt > MISS_REFRESH_MS) {
    build = find(await refreshLinksAsync(options.cachePath));
  }
  return build !== undefined
    ? formatVersion(build.version, build.changeSet)
    : undefined;
};

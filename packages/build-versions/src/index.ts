import { promises as fs } from "fs";
import path from "path";

/**
 * BUTR's registry of the game's builds: each version and changeset with its Steam and GOG build ids
 */
const BUILDS_URL =
  "https://raw.githubusercontent.com/BUTR/Bannerlord.ReferenceAssemblies/master/builds/links.json";
// The registry gains a build with each game update, read again after this long
const REFRESH_MS = 30 * 60 * 1000;
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
   * Where the registry as last read is kept, for when it can't be downloaded
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

const downloadAsync = async (
  cachePath: string,
): Promise<IBuildLinks | undefined> => {
  try {
    const response = await fetch(BUILDS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return await readCacheAsync(cachePath);
    }
    const links: unknown = await response.json();
    if (!isBuildLinks(links)) {
      return await readCacheAsync(cachePath);
    }
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(links), "utf8");
    return links;
  } catch {
    // Offline
    return await readCacheAsync(cachePath);
  }
};

let links: { readAt: number; value: Promise<IBuildLinks | undefined> } | null =
  null;

const getLinksAsync = (cachePath: string): Promise<IBuildLinks | undefined> => {
  if (links === null || Date.now() - links.readAt > REFRESH_MS) {
    links = { readAt: Date.now(), value: downloadAsync(cachePath) };
  }
  return links.value;
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
  const build = (await getLinksAsync(options.cachePath))?.builds.find(
    (candidate) =>
      store === "steam"
        ? candidate.steam?.some((id) => `${id}` === buildId) === true
        : candidate.gog?.includes(buildId) === true,
  );
  return build !== undefined
    ? formatVersion(build.version, build.changeSet)
    : undefined;
};

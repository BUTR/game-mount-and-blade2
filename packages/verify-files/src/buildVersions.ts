import { promises as fs } from "fs";
import path from "path";
import { util } from "@nexusmods/vortex-api";
import { FetchBannerlordVersion } from "@butr/vortexextensionnative";
import { VerifyStore } from "./types";
import { GAME_ID } from "@bannerlord/core/common";

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

// The registry as last read, kept for when it can't be downloaded
const getCachePath = (): string =>
  path.join(util.getVortexPath("userData"), GAME_ID, "build-versions.json");

const readCacheAsync = async (): Promise<IBuildLinks | undefined> => {
  try {
    const cached: unknown = JSON.parse(
      await fs.readFile(getCachePath(), "utf8"),
    );
    return isBuildLinks(cached) ? cached : undefined;
  } catch {
    return undefined;
  }
};

const downloadAsync = async (): Promise<IBuildLinks | undefined> => {
  try {
    const response = await fetch(BUILDS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return await readCacheAsync();
    }
    const links: unknown = await response.json();
    if (!isBuildLinks(links)) {
      return await readCacheAsync();
    }
    const cachePath = getCachePath();
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(links), "utf8");
    return links;
  } catch {
    // Offline
    return await readCacheAsync();
  }
};

let links: { readAt: number; value: Promise<IBuildLinks | undefined> } | null =
  null;

const getLinksAsync = (): Promise<IBuildLinks | undefined> => {
  if (links === null || Date.now() - links.readAt > REFRESH_MS) {
    links = { readAt: Date.now(), value: downloadAsync() };
  }
  return links.value;
};

/**
 * The game's version with its changeset, like v1.4.8.119303, as the game shows it
 */
const formatVersion = (version: string, changeSet: number): string =>
  `${version}.${changeSet}`;

/**
 * The game version of a store's build, from BUTR's registry. Undefined for a build it doesn't know yet
 */
export const getBuildVersionAsync = async (
  store: VerifyStore,
  buildId: string,
): Promise<string | undefined> => {
  const build = (await getLinksAsync())?.builds.find((candidate) =>
    store === "steam"
      ? candidate.steam?.some((id) => `${id}` === buildId) === true
      : candidate.gog?.includes(buildId) === true,
  );
  return build !== undefined
    ? formatVersion(build.version, build.changeSet)
    : undefined;
};

/**
 * The version of the game installed in the folder, from its files, for a build the registry doesn't know yet
 */
export const getInstalledVersion = (gamePath: string): string | undefined => {
  try {
    const library = "TaleWorlds.Library.dll";
    const version = FetchBannerlordVersion.getVersion(gamePath, library);
    const changeSet = FetchBannerlordVersion.getChangeSet(gamePath, library);
    return version !== "" && changeSet > 0
      ? formatVersion(version, changeSet)
      : undefined;
  } catch {
    return undefined;
  }
};

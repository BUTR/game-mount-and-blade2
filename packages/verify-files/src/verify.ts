import { promises as fs } from "fs";
import path from "path";
import { selectors, types, util } from "@nexusmods/vortex-api";
import { compareFiles, listGameFilesAsync } from "./compare";
import { readGogBuildAsync } from "./gog";
import { readSteamBuildAsync } from "./steam";
import { getBuildVersionAsync, getInstalledVersion } from "./buildVersions";
import {
  IVerifyFile,
  IVerifyFilesReport,
  VerifyFileSource,
  VerifyFileStatus,
  VerifyStore,
} from "./types";
import { GAME_ID, MODULES } from "@bannerlord/core/common";
import { bselectors } from "@bannerlord/core/selectors";
import { IStateWithBannerlord } from "@bannerlord/core/types";

const normalize = (filePath: string): string =>
  filePath.replace(/\\/g, "/").toLowerCase();

/**
 * The store whose build the game folder can be compared to, undefined for the others
 */
export const getVerifyStore = (
  state: types.IState,
): VerifyStore | undefined => {
  const store = selectors.discoveryByGame(state, GAME_ID)?.store;
  return store === "steam" || store === "gog" ? store : undefined;
};

/**
 * Opens the game in the store, where its files can be verified and restored. Steam starts verifying, Galaxy shows
 * the game, whose settings have Verify / Repair
 */
const getStoreUrl = (store: VerifyStore, productId: string): string =>
  store === "steam"
    ? `steam://validate/${productId}`
    : `goggalaxy://openGameView/${productId}`;

interface IDeployedMod {
  /**
   * Missing for a mod that was removed since it was deployed
   */
  modId?: string;
  modName: string;
}

/**
 * The files Vortex deployed into the game folder, by their normalized path relative to it, with the mod they're from
 */
const getDeployedFilesAsync = async (
  api: types.IExtensionApi,
  gamePath: string,
): Promise<Map<string, IDeployedMod>> => {
  const state = api.getState<IStateWithBannerlord>();
  const mods = bselectors.bannerlordMods(state);
  const modPaths = selectors.modPathsForGame(state, GAME_ID);
  const deployed = new Map<string, IDeployedMod>();
  for (const [modType, deployPath] of Object.entries(modPaths)) {
    if (!deployPath) {
      continue;
    }
    const manifest = await util.getManifest(api, modType, GAME_ID);
    for (const file of manifest.files) {
      const relative = path.relative(
        gamePath,
        path.join(deployPath, file.target ?? "", file.relPath),
      );
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        continue;
      }
      const mod = mods[file.source];
      deployed.set(
        normalize(relative),
        mod !== undefined
          ? { modId: mod.id, modName: util.renderModName(mod) }
          : { modName: file.source },
      );
    }
  }
  return deployed;
};

/**
 * GOG's files next to the game: its game infos and hash lists, the uninstaller, the shortcut and the icons
 */
const isGogFile = (normalizedPath: string): boolean =>
  !normalizedPath.includes("/") &&
  (normalizedPath.startsWith("goggame-") ||
    /^unins\d+\.(dat|exe|ini|msg)$/.test(normalizedPath) ||
    normalizedPath.endsWith(".lnk") ||
    ["gog.ico", "support.ico", "goglog.ini"].includes(normalizedPath));

const isVortexInternal = (normalizedPath: string): boolean => {
  const name = path.posix.basename(normalizedPath);
  return (
    /^vortex\.deployment(\..+)?\.json$/.test(name) ||
    name.endsWith(".vortex_backup") ||
    name === "__folder_managed_by_vortex"
  );
};

/**
 * Files the game writes into the game folder
 */
const isCreatedByGame = (
  normalizedPath: string,
  status: VerifyFileStatus,
): boolean => {
  return (
    // Terrain shaders the game compiles on first use, replacing the ones the build has. Only the build's, mods ship
    // shader caches of their own
    (status !== "extra" && normalizedPath.includes("/shadercache/")) ||
    // Maps downloaded from multiplayer servers, by the game or the Servers page
    normalizedPath.startsWith("modules/multiplayer/sceneobj/")
  );
};

const getSource = (
  store: VerifyStore,
  normalizedPath: string,
  status: VerifyFileStatus,
  deployed: Map<string, IDeployedMod>,
): VerifyFileSource => {
  if (deployed.has(normalizedPath)) {
    return "vortex";
  }
  if (isVortexInternal(normalizedPath)) {
    return "vortexInternal";
  }
  if (store === "gog" && isGogFile(normalizedPath)) {
    return "store";
  }
  if (isCreatedByGame(normalizedPath, status)) {
    return "game";
  }
  return "unknown";
};

/**
 * A module's folder, Modules/{module}, for everything in it. Its folder for any other file
 */
export const getFolder = (filePath: string): string => {
  const parts = filePath.split("/");
  if (parts.length > 2 && parts[0]!.toLowerCase() === MODULES.toLowerCase()) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts.slice(0, -1).join("/");
};

/**
 * Compares the game folder to the files of the installed Steam or GOG build and tells where the files that don't
 * belong to it came from
 */
export const verifyFilesAsync = async (
  api: types.IExtensionApi,
): Promise<IVerifyFilesReport> => {
  const state = api.getState();
  const gamePath = selectors.discoveryByGame(state, GAME_ID)?.path;
  const store = getVerifyStore(state);
  if (gamePath === undefined || store === undefined) {
    throw new Error(
      "Only the Steam and GOG versions of the game can be verified",
    );
  }

  const build =
    store === "steam"
      ? await readSteamBuildAsync(gamePath)
      : await readGogBuildAsync(gamePath);
  // The game's files tell it too, for a build too new for the registry
  const version =
    (await getBuildVersionAsync(store, build.buildId)) ??
    getInstalledVersion(gamePath);
  const report: IVerifyFilesReport = {
    store,
    buildId: build.buildId,
    ...(version !== undefined ? { version } : {}),
    storeUrl: getStoreUrl(store, build.productId),
    expectedFileCount: 0,
    sizesKnown: build.files.some((file) => file.size !== undefined),
    missingLists: build.missingLists,
    files: [],
  };
  if (build.missingLists.length > 0) {
    return report;
  }

  const result = compareFiles(build.files, await listGameFilesAsync(gamePath));
  const deployed = await getDeployedFilesAsync(api, gamePath);

  const toFile = (
    filePath: string,
    size: number | undefined,
    status: VerifyFileStatus,
  ): IVerifyFile => {
    const normalizedPath = normalize(filePath);
    const source = getSource(store, normalizedPath, status, deployed);
    const mod = deployed.get(normalizedPath);
    return {
      path: filePath,
      folder: getFolder(filePath),
      status,
      source,
      ...(mod?.modId !== undefined ? { modId: mod.modId } : {}),
      ...(mod !== undefined ? { modName: mod.modName } : {}),
      ...(size !== undefined ? { size } : {}),
    };
  };

  report.expectedFileCount = result.expectedFileCount;
  report.files = [
    ...result.extra.map((file) => toFile(file.path, file.size, "extra")),
    ...result.changed.map((file) => ({
      ...toFile(file.path, file.size, "changed"),
      expectedSize: file.expectedSize,
    })),
    ...result.missing.map((file) => toFile(file.path, file.size, "missing")),
  ];
  return report;
};

/**
 * Opens the Mods page on the mod. The classic table scrolls to the mod's row and highlights it, the modern one can't
 * be asked to show a mod, so it's only opened
 */
export const showModInModsPage = (
  api: types.IExtensionApi,
  modId: string,
): void => {
  api.events.emit("show-main-page", "Mods");
  // The Mods page may not be mounted until it's shown
  setTimeout(() => {
    api.events.emit("mods-scroll-to", modId);
    api.highlightControl(`.${util.sanitizeCSSId(modId)}`, 4000);
  }, 500);
};

/**
 * Extra files Vortex and the store don't manage. Vortex's backups are left, it restores them when purging, and the
 * store's files, its uninstaller needs them
 */
export const isDeletable = (file: IVerifyFile): boolean =>
  file.status === "extra" &&
  (file.source === "unknown" || file.source === "game");

/**
 * Deletes extra files from the game folder, and the folders that are left empty
 */
export const deleteFilesAsync = async (
  gamePath: string,
  files: readonly IVerifyFile[],
): Promise<void> => {
  const root = path.resolve(gamePath);
  const folders = new Set<string>();
  for (const file of files) {
    if (!isDeletable(file)) {
      continue;
    }
    const filePath = path.resolve(root, file.path);
    if (path.relative(root, filePath).startsWith("..")) {
      throw new Error(
        `'${file.path}' is outside of the game folder and was not deleted`,
      );
    }
    await fs.rm(filePath, { force: true });
    folders.add(path.dirname(filePath));
  }
  await removeEmptyFoldersAsync(root, folders);
};

/**
 * Removes the folders, and their parents up to the game folder, that deleting files left empty
 */
export const removeEmptyFoldersAsync = async (
  gamePath: string,
  folders: Iterable<string>,
): Promise<void> => {
  const root = path.resolve(gamePath);
  // Deepest first, so a folder's empty subfolders are gone before it is checked
  const sorted = [...folders].sort((lhs, rhs) => rhs.length - lhs.length);
  for (const folder of sorted) {
    let current = folder;
    while (current.length > root.length && current.startsWith(root)) {
      try {
        // Fails on a folder that isn't empty
        await fs.rmdir(current);
      } catch {
        break;
      }
      current = path.dirname(current);
    }
  }
};

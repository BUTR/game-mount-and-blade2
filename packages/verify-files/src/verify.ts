import { promises as fs } from "fs";
import path from "path";
import { selectors, types, util } from "@nexusmods/vortex-api";
import {
  getEpicDataPath,
  getSteamPaths,
  getXboxRelatedPackageRoots,
} from "@bannerlord/store-builds/storePaths";
import { verifyBuildInWorkerAsync } from "@bannerlord/store-builds/verifyBuild";
import { readXboxProductIdAsync } from "@bannerlord/store-builds/xbox";
import { getBuildVersionAsync, getInstalledVersion } from "./buildVersions";
import {
  IVerifyFile,
  IVerifyFilesReport,
  IVerifyPackage,
  VerifyFileSource,
  VerifyFileStatus,
  VerifyStore,
} from "./types";
import { GAME_ID } from "@bannerlord/core/common";
import { MODULES } from "@bannerlord/game-layout";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";
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
  return store === "steam" ||
    store === "gog" ||
    store === "epic" ||
    store === "xbox"
    ? store
    : undefined;
};

export const getStoreName = (store: VerifyStore): string =>
  ({ steam: "Steam", gog: "GOG", epic: "Epic", xbox: "Xbox" })[store];

/**
 * Opens the game in the store, where its files can be verified and restored. Steam starts verifying, Galaxy shows
 * the game, whose settings have Verify / Repair. The Epic Games Launcher queues a verify with its undocumented
 * `action=verify` link, the one games use to report a broken install; without the game's id the launcher is opened,
 * the game's Manage has Verify. The Xbox app's links can't open Manage, its game page is opened, whose Manage has
 * Verify and repair
 */
const getStoreUrl = (store: VerifyStore, productId: string): string =>
  ({
    steam: `steam://validate/${productId}`,
    gog: `goggalaxy://openGameView/${productId}`,
    // The id is namespace:catalogItemId:appName or the AppName alone, the launcher accepts both
    epic:
      productId !== ""
        ? `com.epicgames.launcher://apps/${encodeURIComponent(productId)}?action=verify`
        : "com.epicgames.launcher://",
    xbox: `msxbox://game/?productId=${productId}`,
  })[store];

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

/**
 * The module folder a path is in, lowercased, like `modules/bannerlord.harmony` of its files
 */
const getModuleFolder = (normalizedPath: string): string | undefined => {
  const [modules, folder, ...rest] = normalizedPath.split("/");
  return modules === MODULES.toLowerCase() &&
    folder !== undefined &&
    rest.length > 0
    ? `${modules}/${folder}`
    : undefined;
};

/**
 * The mods of the game folder, their name by module folder: its modules that aren't the game's, from the launcher
 * manager's modules the Load Order shows. Only the files Vortex didn't deploy are matched with them, those are copied
 * in by hand, even of a module Vortex has a mod of
 */
const getManualModsAsync = async (
  api: types.IExtensionApi,
  gamePath: string,
): Promise<Map<string, string>> => {
  const modules =
    await VortexLauncherManager.getInstance(api).getAllModulesAsync();
  const mods = new Map<string, string>();
  for (const module of Object.values(modules)) {
    // The module's path is its SubModule.xml's. Steam Workshop's modules aren't in the game folder
    const folder = normalize(
      path.relative(gamePath, path.dirname(module.path)),
    );
    const [modules, name, ...rest] = folder.split("/");
    if (
      !module.isOfficial &&
      modules === MODULES.toLowerCase() &&
      name !== undefined &&
      rest.length === 0
    ) {
      mods.set(folder, module.name || module.id);
    }
  }
  return mods;
};

/**
 * The Epic Games Launcher's files in the game folder: its manifests and staging, and the marker of a moved install
 */
const isEpicFile = (normalizedPath: string): boolean =>
  normalizedPath.startsWith(".egstore/") || normalizedPath === "$movedmarker";

/**
 * The Xbox app's file in the package's Content, which starts the game, it isn't in the package's file list
 */
const isXboxFile = (normalizedPath: string): boolean =>
  normalizedPath === "gamelaunchhelper.exe";

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
    normalizedPath.startsWith("modules/multiplayer/sceneobj/") ||
    // The layout of the game's debug windows, next to its executable
    /^bin\/[^/]+\/imgui\.ini$/.test(normalizedPath)
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
  if (
    (store === "gog" && isGogFile(normalizedPath)) ||
    (store === "epic" && isEpicFile(normalizedPath)) ||
    (store === "xbox" && isXboxFile(normalizedPath))
  ) {
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
 * The folder a file of a package other than the game's is listed under, apart from the game folder's: the package's
 * name and the folder in it
 */
export const getPackageFolder = (
  filePackage: IVerifyPackage,
  filePath: string,
): string => {
  const folder = getFolder(filePath);
  return folder !== "" ? `${filePackage.name} › ${folder}` : filePackage.name;
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
      "Only the Steam, GOG, Epic and Xbox versions of the game can be verified",
    );
  }

  // Off the renderer's thread, the parsing, listing and comparing would compete with rendering the page
  const build = await verifyBuildInWorkerAsync({
    store,
    gamePath,
    steamPaths: store === "steam" ? getSteamPaths() : [],
    epicDataPath: store === "epic" ? getEpicDataPath() : undefined,
    xboxPackageRoots:
      store === "xbox"
        ? getXboxRelatedPackageRoots(
            (await readXboxProductIdAsync(gamePath)) ?? "",
          )
        : [],
  });
  // The game's files tell it too, for a build too new for the registry
  const version =
    build.version ??
    (await getBuildVersionAsync(store, build.buildId)) ??
    getInstalledVersion(gamePath);
  const report: IVerifyFilesReport = {
    store,
    buildId: build.buildId,
    ...(version !== undefined ? { version } : {}),
    storeUrl: getStoreUrl(store, build.productId),
    expectedFileCount: 0,
    sizesKnown: build.sizesKnown,
    contentsChecked: build.contentsChecked,
    missingLists: build.missingLists,
    files: [],
  };
  const result = build.comparison;
  if (result === undefined) {
    return report;
  }

  const deployed = await getDeployedFilesAsync(api, gamePath);
  const manualMods = await getManualModsAsync(api, gamePath);

  const toFile = (
    filePath: string,
    size: number | undefined,
    status: VerifyFileStatus,
  ): IVerifyFile => {
    const normalizedPath = normalize(filePath);
    let source = getSource(store, normalizedPath, status, deployed);
    const mod = deployed.get(normalizedPath);
    const manualMod =
      source === "unknown" && status === "extra"
        ? manualMods.get(getModuleFolder(normalizedPath) ?? "")
        : undefined;
    if (manualMod !== undefined) {
      source = "manualMod";
    }
    const modName = mod?.modName ?? manualMod;
    return {
      path: filePath,
      folder: getFolder(filePath),
      status,
      source,
      ...(mod?.modId !== undefined ? { modId: mod.modId } : {}),
      ...(modName !== undefined ? { modName } : {}),
      ...(size !== undefined ? { size } : {}),
    };
  };

  // A DLC's files, in its own folder: Vortex doesn't deploy there, the game may write into its modules
  const toPackageFile = (
    filePath: string,
    size: number | undefined,
    status: VerifyFileStatus,
    filePackage: IVerifyPackage,
  ): IVerifyFile => ({
    path: filePath,
    folder: getPackageFolder(filePackage, filePath),
    status,
    source: getSource(store, normalize(filePath), status, new Map()),
    ...(size !== undefined ? { size } : {}),
    package: filePackage,
  });

  report.expectedFileCount =
    result.expectedFileCount +
    build.packages.reduce((sum, item) => sum + item.expectedFileCount, 0);
  report.files = [
    ...result.extra.map((file) => toFile(file.path, file.size, "extra")),
    ...result.changed.map((file) => ({
      ...toFile(file.path, file.size, "changed"),
      expectedSize: file.expectedSize,
    })),
    ...result.missing.map((file) => toFile(file.path, file.size, "missing")),
    ...build.packages.flatMap(
      ({ name, path: packagePath, changed, missing }) => {
        const filePackage = { name, path: packagePath };
        return [
          ...changed.map((file) => ({
            ...toPackageFile(file.path, file.size, "changed", filePackage),
            expectedSize: file.expectedSize,
          })),
          ...missing.map((file) =>
            toPackageFile(file.path, file.size, "missing", filePackage),
          ),
        ];
      },
    ),
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
 * store's files, its uninstaller needs them. Only the game folder's
 */
export const isDeletable = (file: IVerifyFile): boolean =>
  file.status === "extra" &&
  file.package === undefined &&
  (file.source === "unknown" ||
    file.source === "manualMod" ||
    file.source === "game");

/**
 * Whether the path is strictly below the root. Compared as paths: "Bannerlord2" isn't inside "Bannerlord", and a
 * path on another drive is relative to it as an absolute path, not one starting with ".."
 */
const isInside = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
};

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
    if (!isInside(root, filePath)) {
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
    let current = path.resolve(folder);
    while (isInside(root, current)) {
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

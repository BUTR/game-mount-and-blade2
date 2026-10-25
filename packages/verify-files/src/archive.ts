import { promises as fs } from "fs";
import path from "path";
import { util } from "@nexusmods/vortex-api";
import {
  extractZipEntryAsync,
  IZipSource,
  layoutZip,
  readZipEntriesAsync,
  verifyZipAsync,
  writeZipAsync,
} from "@bannerlord/zip/storedZip";
import { IVerifyFile, VerifyStore } from "./types";
import { getBuildVersionAsync } from "./buildVersions";
import { isDeletable, removeEmptyFoldersAsync } from "./verify";
import { GAME_ID } from "@bannerlord/core/common";
import { getPathExistsAsync } from "@bannerlord/core/fsUtils";

const ARCHIVES_FOLDER = "verify-files";
const MANIFEST_VERSION = 1;
// An archive is written under this name and renamed once it's whole, a crash leaves only this behind
const PARTIAL_EXTENSION = ".partial";
// Kept free on the drive besides the archive, so archiving doesn't fill it to the last byte
const FREE_SPACE_MARGIN = 256 * 1024 * 1024;

/**
 * The .json next to an archive, so the page lists archives without opening them
 */
interface IArchiveManifest {
  version: number;
  /**
   * What the user called the archive, the zip's file name stays its time
   */
  name?: string;
  createdAt: string;
  store: VerifyStore;
  buildId: string;
  /**
   * The game's version with its changeset, an archive without it is looked up by its build
   */
  gameVersion?: string;
  /**
   * Relative to the game folder, '/' separated
   */
  files: { path: string; size: number }[];
}

export interface IFilesArchive extends IArchiveManifest {
  archivePath: string;
  size: number;
}

export interface IArchiveResult {
  archive: IFilesArchive;
  /**
   * Files that changed after they were archived, they're left in the game folder
   */
  kept: string[];
}

export interface IRestoreResult {
  restored: number;
  /**
   * Files the game folder has again, which are left as they are
   */
  skipped: number;
}

/**
 * Next to Vortex's other data of the game, not in the game folder that verifying lists
 */
export const getArchivesPath = (): string =>
  path.join(util.getVortexPath("userData"), GAME_ID, ARCHIVES_FOLDER);

const getManifestPath = (archivePath: string): string =>
  archivePath.replace(/\.zip$/i, ".json");

const formatTimestamp = (date: Date): string =>
  date
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "");

const formatGigabytes = (bytes: number): string =>
  `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/**
 * Written under another name and renamed, the file is either the old one or the whole new one
 */
const writeFileAtomicAsync = async (
  filePath: string,
  content: string,
): Promise<void> => {
  const partialPath = filePath + PARTIAL_EXTENSION;
  const file = await fs.open(partialPath, "w");
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await fs.rename(partialPath, filePath);
};

/**
 * Moves extra files of the game folder into a new zip, with their paths in the game folder. Only files that can be
 * deleted, the ones Vortex and the store don't manage.
 *
 * The files are stored, not compressed, so the archive's size is known first: the drive must have the space, and the
 * archive's file is made that large before anything is written into it. The files are deleted only once the archive
 * is complete, on the disk and read back, and a file is kept when it changed since it was archived. Vortex closing
 * at any point leaves the game folder whole, with at most a partial archive the next listing removes
 */
export const archiveFilesAsync = async (
  gamePath: string,
  store: VerifyStore,
  buildId: string,
  files: readonly IVerifyFile[],
  options: {
    /**
     * Optional, blank for none
     */
    name?: string;
    /**
     * The game's version the files were archived from
     */
    version?: string;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<IArchiveResult> => {
  const { version, onProgress } = options;
  const name = options.name?.trim();
  // The sizes and times as they are now, the deleting below compares to them
  const sources: (IZipSource & { mtimeMs: number })[] = [];
  for (const file of files.filter(isDeletable)) {
    const filePath = path.join(gamePath, file.path);
    const stat = await fs.stat(filePath);
    sources.push({
      name: file.path,
      filePath,
      size: stat.size,
      mtime: stat.mtime,
      mtimeMs: stat.mtimeMs,
    });
  }
  const layout = layoutZip(sources);

  const archivesPath = getArchivesPath();
  await fs.mkdir(archivesPath, { recursive: true });
  const { bavail, bsize } = await fs.statfs(archivesPath);
  const free = bavail * bsize;
  if (free < layout.size + FREE_SPACE_MARGIN) {
    throw new Error(
      `The archive needs ${formatGigabytes(layout.size + FREE_SPACE_MARGIN)} free on the drive of ` +
        `'${archivesPath}', it has ${formatGigabytes(free)}`,
    );
  }

  const createdAt = new Date();
  const archivePath = path.join(
    archivesPath,
    `files-${formatTimestamp(createdAt)}.zip`,
  );
  const partialPath = archivePath + PARTIAL_EXTENSION;
  try {
    // Takes the space now, on NTFS a file is given its clusters when it grows. Fails here when the drive is full
    const partial = await fs.open(partialPath, "wx");
    try {
      await partial.truncate(layout.size);
    } finally {
      await partial.close();
    }
    // Writing is half the work, reading it back the other half
    const total = Math.max(1, layout.size * 2);
    await writeZipAsync(partialPath, layout, (bytes) =>
      onProgress?.(bytes / total),
    );
    await verifyZipAsync(partialPath, sources);
    onProgress?.(1);
  } catch (err) {
    await fs.rm(partialPath, { force: true });
    throw err;
  }
  await fs.rename(partialPath, archivePath);

  const manifest: IArchiveManifest = {
    version: MANIFEST_VERSION,
    ...(name ? { name } : {}),
    createdAt: createdAt.toISOString(),
    store,
    buildId,
    ...(version !== undefined ? { gameVersion: version } : {}),
    files: sources.map((source) => ({ path: source.name, size: source.size })),
  };
  await writeFileAtomicAsync(
    getManifestPath(archivePath),
    JSON.stringify(manifest, null, 2),
  );

  // Only now, with the archive complete. A file that changed since it was copied keeps its changes
  const kept: string[] = [];
  const folders = new Set<string>();
  for (const source of sources) {
    const stat = await fs.stat(source.filePath).catch(() => null);
    if (stat === null) {
      continue;
    }
    if (stat.size !== source.size || stat.mtimeMs !== source.mtimeMs) {
      kept.push(source.name);
      continue;
    }
    await fs.rm(source.filePath, { force: true });
    folders.add(path.dirname(source.filePath));
  }
  await removeEmptyFoldersAsync(gamePath, folders);

  return {
    archive: { ...manifest, archivePath, size: layout.size },
    kept,
  };
};

/**
 * The archives made from the game folder, newest first. What a crash left behind is removed: a partial archive, the
 * files it had are still in the game folder
 */
export const readArchivesAsync = async (): Promise<IFilesArchive[]> => {
  const archivesPath = getArchivesPath();
  if (!(await getPathExistsAsync(archivesPath))) {
    return [];
  }
  const archives: IFilesArchive[] = [];
  for (const name of await fs.readdir(archivesPath)) {
    const filePath = path.join(archivesPath, name);
    if (name.endsWith(PARTIAL_EXTENSION)) {
      await fs.rm(filePath, { force: true }).catch(() => null);
      continue;
    }
    if (!name.toLowerCase().endsWith(".zip")) {
      continue;
    }
    try {
      const manifest = JSON.parse(
        await fs.readFile(getManifestPath(filePath), "utf8"),
      ) as IArchiveManifest;
      const version =
        manifest.gameVersion ??
        (await getBuildVersionAsync(manifest.store, manifest.buildId));
      archives.push({
        ...manifest,
        ...(version !== undefined ? { gameVersion: version } : {}),
        archivePath: filePath,
        size: (await fs.stat(filePath)).size,
      });
    } catch {
      // Not one of these archives, or its list is missing
    }
  }
  return archives.sort((lhs, rhs) =>
    rhs.createdAt.localeCompare(lhs.createdAt),
  );
};

/**
 * Puts the files of an archive back into the game folder. A file the game folder has again, like a mod installed
 * since, is left as it is. Each file is written under another name and renamed once its CRC matches, a crash leaves
 * no half written file under a real name
 */
export const restoreArchiveAsync = async (
  gamePath: string,
  archive: IFilesArchive,
  options: {
    /**
     * The archive's paths to restore, all of them when undefined
     */
    only?: ReadonlySet<string>;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<IRestoreResult> => {
  const { only, onProgress } = options;
  const root = path.resolve(gamePath);
  const entries = (await readZipEntriesAsync(archive.archivePath)).filter(
    (entry) => only === undefined || only.has(entry.name),
  );
  const total = Math.max(
    1,
    entries.reduce((sum, entry) => sum + entry.size, 0),
  );
  let done = 0;
  let restored = 0;
  let skipped = 0;
  for (const entry of entries) {
    const targetPath = path.resolve(root, entry.name);
    const relative = path.relative(root, targetPath);
    if (
      relative === "" ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`'${entry.name}' is outside of the game folder`);
    }
    if (await getPathExistsAsync(targetPath)) {
      skipped++;
    } else {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const partialPath = targetPath + PARTIAL_EXTENSION;
      await fs.rm(partialPath, { force: true });
      await extractZipEntryAsync(
        archive.archivePath,
        entry,
        partialPath,
        (bytes) => onProgress?.((done + bytes) / total),
      );
      await fs.rename(partialPath, targetPath);
      restored++;
    }
    done += entry.size;
    onProgress?.(done / total);
  }
  return { restored, skipped };
};

/**
 * Names the archive, or unnames it with a blank name. Only its list changes, the zip stays as it is
 */
export const renameArchiveAsync = async (
  archive: IFilesArchive,
  name: string,
): Promise<void> => {
  const manifestPath = getManifestPath(archive.archivePath);
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as IArchiveManifest;
  const trimmed = name.trim();
  if (trimmed) {
    manifest.name = trimmed;
  } else {
    delete manifest.name;
  }
  await writeFileAtomicAsync(manifestPath, JSON.stringify(manifest, null, 2));
};

export const deleteArchiveAsync = async (
  archive: IFilesArchive,
): Promise<void> => {
  // The list first, an archive without it isn't listed
  await fs.rm(getManifestPath(archive.archivePath), { force: true });
  await fs.rm(archive.archivePath, { force: true });
};

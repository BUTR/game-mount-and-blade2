import { promises as fs } from "fs";
import path from "path";
import { util } from "@nexusmods/vortex-api";
import { Compression } from "@butr/vortexextensionnative";
import {
  extractZipEntryAsync,
  getZipSizeBound,
  IZipSource,
  readZipEntriesAsync,
  verifyZipAsync,
  writeZipAsync,
} from "@bannerlord/zip/zip";
import { IVerifyFile, VerifyStore } from "./types";
import { getBuildVersionAsync } from "./buildVersions";
import { isDeletable, removeEmptyFoldersAsync } from "./verify";
import { GAME_ID } from "@bannerlord/core/common";
import { getPathExistsAsync } from "@bannerlord/core/fsUtils";
import { formatSize } from "@bannerlord/ui/format";

const ARCHIVES_FOLDER = "verify-files";
const MANIFEST_VERSION = 1;
// An archive is written under this name and renamed once it's whole, a crash leaves only this behind
const PARTIAL_EXTENSION = ".partial";
// Kept free on the drive besides the archive, so archiving doesn't fill it to the last byte
const FREE_SPACE_MARGIN = 256 * 1024 * 1024;

// Formats compressed already, deflating them takes time and saves nothing. The other files are tried, the ones that
// don't compress are stored. Not PNG: the game's compress to 60%
const COMPRESSED_EXTENSIONS = new Set([
  ".7z",
  ".bank",
  ".bik",
  ".docx",
  ".gif",
  ".gz",
  ".ivf",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".nupkg",
  ".ogg",
  ".pdf",
  ".rar",
  ".wav",
  ".webm",
  ".zip",
]);

const shouldCompress = (filePath: string): boolean =>
  !COMPRESSED_EXTENSIONS.has(path.extname(filePath).toLowerCase());

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

/**
 * A name no other archive has, its partial file created to claim it. Archives made within the same second are
 * numbered, the rename at the end would replace the earlier one, whose files are already deleted
 */
const reserveArchivePathAsync = async (
  archivesPath: string,
  createdAt: Date,
): Promise<{ archivePath: string; partial: fs.FileHandle }> => {
  const baseName = `files-${formatTimestamp(createdAt)}`;
  for (let i = 0; ; i++) {
    const archivePath = path.join(
      archivesPath,
      `${baseName}${i === 0 ? "" : `-${i}`}.zip`,
    );
    if (await getPathExistsAsync(archivePath)) {
      continue;
    }
    try {
      const partial = await fs.open(archivePath + PARTIAL_EXTENSION, "wx");
      return { archivePath, partial };
    } catch (err) {
      if (!(err instanceof Error && "code" in err && err.code === "EEXIST")) {
        throw err;
      }
    }
  }
};

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
 * The free space of the drive the archives are on, their folder is made first
 */
const getArchivesFreeSpaceAsync = async (): Promise<number> => {
  const archivesPath = getArchivesPath();
  await fs.mkdir(archivesPath, { recursive: true });
  const { bavail, bsize } = await fs.statfs(archivesPath);
  return bavail * bsize;
};

export interface IArchiveSpace {
  /**
   * The archive's size with the space kept free besides it
   */
  required: number;
  free: number;
  /**
   * The root of the drive the archives are on   */
  drive: string;
}

/**
 * The space archiving the files needs and the space the archives' drive has, to offer archiving only when it fits.
 * From the sizes the verifying found, archiving measures the files again and checks once more
 */
export const getArchiveSpaceAsync = async (
  files: readonly IVerifyFile[],
): Promise<IArchiveSpace> => {
  const bound = getZipSizeBound(
    files.filter(isDeletable).map((file) => ({
      name: file.path,
      filePath: "",
      size: file.size ?? 0,
      mtime: new Date(0),
      compress: shouldCompress(file.path),
    })),
  );
  return {
    required: bound + FREE_SPACE_MARGIN,
    free: await getArchivesFreeSpaceAsync(),
    drive: path.parse(getArchivesPath()).root,
  };
};

/**
 * Moves extra files of the game folder into a new zip, with their paths in the game folder. Only files that can be
 * deleted, the ones Vortex and the store don't manage.
 *
 * The files are deflated with ISA-L where that saves space, in chunks, so memory stays bounded. The drive must have
 * the space the archive can take at most, the files stored, and the archive's file is made that large before anything
 * is written into it, then cut to the size it took. The files are deleted only once the archive is complete, on the
 * disk and read back, and a file is kept when it changed since it was archived. Vortex closing at any point leaves the
 * game folder whole, with at most a partial archive the next listing removes
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
      compress: shouldCompress(file.path),
    });
  }
  const bound = getZipSizeBound(sources);

  const archivesPath = getArchivesPath();
  const free = await getArchivesFreeSpaceAsync();
  if (free < bound + FREE_SPACE_MARGIN) {
    throw new Error(
      `Archiving requires ${formatSize(bound + FREE_SPACE_MARGIN)} of free space on the drive containing ` +
        `'${archivesPath}', but only ${formatSize(free)} is available`,
    );
  }

  const createdAt = new Date();
  const { archivePath, partial } = await reserveArchivePathAsync(
    archivesPath,
    createdAt,
  );
  const partialPath = archivePath + PARTIAL_EXTENSION;
  let size: number;
  try {
    // Takes the space now, on NTFS a file is given its clusters when it grows. Fails here when the drive is full
    try {
      await partial.truncate(bound);
    } finally {
      await partial.close();
    }
    // Writing is half the work, reading it back the other half
    const filesSize = sources.reduce((sum, source) => sum + source.size, 0);
    const total = Math.max(1, filesSize * 2);
    size = await writeZipAsync(partialPath, sources, {
      deflateChunk: Compression.deflateRawChunkAsync,
      onProgress: (bytes) => onProgress?.(bytes / total),
    });
    // 1 is reported once, when the archive is complete
    await verifyZipAsync(partialPath, sources, (bytes) => {
      if (bytes < filesSize) {
        onProgress?.((filesSize + bytes) / total);
      }
    });
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
    archive: { ...manifest, archivePath, size },
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

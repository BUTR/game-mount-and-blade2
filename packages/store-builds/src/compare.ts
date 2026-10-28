import { promises as fs } from "fs";
import path from "path";
import { IExpectedFile } from "./types";

/**
 * A file in the game folder
 */
export interface IActualFile {
  /**
   * Relative to the game folder
   */
  path: string;
  size: number;
  /**
   * A link, like Vortex's symlink deployment, its size is the link's
   */
  isLink: boolean;
}

export interface IChangedFile {
  path: string;
  size: number;
  expectedSize: number;
}

export interface ICompareResult {
  expectedFileCount: number;
  extra: IActualFile[];
  changed: IChangedFile[];
  missing: IExpectedFile[];
}

/**
 * '/' separated, without leading and trailing separators. The stores' lists are made on Windows
 */
export const normalizePath = (filePath: string): string =>
  filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

const toKey = (filePath: string): string =>
  normalizePath(filePath).toLowerCase();

// Files stat'ed at once, enough to keep the disk busy without opening thousands of handles
const STAT_BATCH_SIZE = 256;

/**
 * The files in the game folder, hidden ones too. Linked folders, like junctions, are listed as links and not walked
 * into, they can point anywhere. Not turbowalk, its sizes are the space files take on the disk
 */
export const listGameFilesAsync = async (
  gamePath: string,
): Promise<IActualFile[]> => {
  const entries = (
    await fs.readdir(gamePath, { recursive: true, withFileTypes: true })
  ).filter((entry) => !entry.isDirectory());

  const files: IActualFile[] = [];
  for (let i = 0; i < entries.length; i += STAT_BATCH_SIZE) {
    const batch = entries.slice(i, i + STAT_BATCH_SIZE);
    const stats = await Promise.all(
      batch.map((entry) =>
        fs.lstat(path.join(entry.parentPath, entry.name)).catch(() => null),
      ),
    );
    batch.forEach((entry, index) => {
      const stat = stats[index];
      if (stat != null) {
        files.push({
          path: path.relative(
            gamePath,
            path.join(entry.parentPath, entry.name),
          ),
          size: stat.size,
          isLink: stat.isSymbolicLink(),
        });
      }
    });
  }
  return files;
};

interface IExpectedEntry {
  path: string;
  // Null when any list of the path doesn't tell the size. A path in several lists, a DLC overriding a base file, is
  // accepted with the size of either
  sizes: Set<number> | null;
  found: boolean;
}

/**
 * Compares the game folder to the files of the build, ignoring case and separators
 */
export const compareFiles = (
  expected: readonly IExpectedFile[],
  actual: readonly IActualFile[],
): ICompareResult => {
  const expectedFiles = new Map<string, IExpectedEntry>();
  for (const file of expected) {
    const key = toKey(file.path);
    const existing = expectedFiles.get(key);
    if (existing === undefined) {
      expectedFiles.set(key, {
        path: normalizePath(file.path),
        sizes: file.size !== undefined ? new Set([file.size]) : null,
        found: false,
      });
    } else if (file.size === undefined) {
      existing.sizes = null;
    } else {
      existing.sizes?.add(file.size);
    }
  }

  const result: ICompareResult = {
    expectedFileCount: expectedFiles.size,
    extra: [],
    changed: [],
    missing: [],
  };
  for (const file of actual) {
    const filePath = normalizePath(file.path);
    const expectedFile = expectedFiles.get(filePath.toLowerCase());
    if (expectedFile === undefined) {
      result.extra.push({ ...file, path: filePath });
      continue;
    }
    expectedFile.found = true;
    if (
      file.isLink ||
      expectedFile.sizes === null ||
      expectedFile.sizes.has(file.size)
    ) {
      continue;
    }
    result.changed.push({
      path: filePath,
      size: file.size,
      expectedSize: expectedFile.sizes.values().next().value!,
    });
  }

  for (const file of expectedFiles.values()) {
    if (!file.found) {
      result.missing.push({
        path: file.path,
        ...(file.sizes !== null
          ? { size: file.sizes.values().next().value! }
          : {}),
      });
    }
  }
  return result;
};

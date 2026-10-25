import { readdir, stat } from "node:fs/promises";
import nodePath from "path";

/**
 * The game's folder of modules
 */
export const MODULES = `Modules`;

/**
 * The file that describes a module, in the module's folder
 */
export const SUBMODULE_FILE = `SubModule.xml`;

export interface IDirectoryEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * Reads a folder's entries, following symbolic links and junctions to what they point to.
 * readdir reports a link as neither a file nor a folder, so a module folder linked into Modules would be skipped.
 * A link that is broken or points back into itself is neither
 */
export const readDirectoryEntriesAsync = async (
  directoryPath: string,
): Promise<IDirectoryEntry[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return await Promise.all(
    entries.map(async (entry): Promise<IDirectoryEntry> => {
      if (!entry.isSymbolicLink()) {
        return {
          name: entry.name,
          isFile: entry.isFile(),
          isDirectory: entry.isDirectory(),
        };
      }
      const target = await stat(nodePath.join(directoryPath, entry.name)).catch(
        () => null,
      );
      return {
        name: entry.name,
        isFile: target?.isFile() ?? false,
        isDirectory: target?.isDirectory() ?? false,
      };
    }),
  );
};

/**
 * The names of the module folders in the game's Modules folder, linked ones included. Empty when it can't be read
 */
export const readModuleFoldersAsync = async (
  gamePath: string,
): Promise<string[]> =>
  (
    await readDirectoryEntriesAsync(nodePath.join(gamePath, MODULES)).catch(
      () => [],
    )
  )
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name);

/**
 * Finds the SubModule.xml files in a folder and in the folders below it, down to the given depth
 */
export const findSubModuleFilesAsync = async (
  folder: string,
  depth: number,
): Promise<string[]> => {
  const entries = await readDirectoryEntriesAsync(folder).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = nodePath.join(folder, entry.name);
    if (
      entry.isFile &&
      entry.name.toLowerCase() === SUBMODULE_FILE.toLowerCase()
    ) {
      files.push(entryPath);
    } else if (entry.isDirectory && depth > 0) {
      files.push(...(await findSubModuleFilesAsync(entryPath, depth - 1)));
    }
  }
  return files;
};

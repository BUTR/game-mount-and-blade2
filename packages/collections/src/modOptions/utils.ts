import { fs, types, util } from "@nexusmods/vortex-api";
import turbowalk from "turbowalk";
import path from "path";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { getModSettingsPath } from "@bannerlord/game-layout";
import {
  getPathExistsAsync,
  isFileNotFoundError,
} from "@bannerlord/core/fsUtils";
import {
  ModOptionsEntry,
  ModOptionsEntryType,
  ModOptionsStorage,
  PersistentModOptionsEntry,
} from "./types";

/**
 * The mods' settings in the game's documents folder. Vortex's documents path is the Documents known folder
 */
export const getSettingsPath = (): string =>
  getModSettingsPath(util.getVortexPath("documents"));

// The "}" is a typo, kept so the backups made with it are still found
const getBackupId = (mod: types.IMod): string => `bak.vortex.${mod.archiveId}}`;

/**
 * Next to an option the collection added where the user had none, restoring deletes the option
 */
const ADDED_MARKER = ".added";

const getModOptionsFolder = (type: string): string | undefined => {
  switch (type) {
    case "global":
      return path.join(getSettingsPath(), "Global");
    case "special":
      return getSettingsPath();
    default:
      return undefined;
  }
};

/**
 * The path comes from the collection, one that leaves the folder is refused
 */
const getModOptionFilePath = (type: string, relativePath: string): string => {
  const folder = getModOptionsFolder(type);
  if (folder === undefined) {
    return "";
  }
  const filePath = path.resolve(folder, relativePath);
  const relative = path.relative(folder, filePath);
  if (
    relative === "" ||
    path.isAbsolute(relative) ||
    relative.split(path.sep)[0] === ".."
  ) {
    return "";
  }
  return filePath;
};

interface IBackupFiles {
  backups: string[];
  added: string[];
}

const findBackupFilesAsync = async (mod: types.IMod): Promise<IBackupFiles> => {
  const id = getBackupId(mod);
  const settingsPath = getSettingsPath();
  await fs.ensureDirAsync(settingsPath);
  const backupFiles: IBackupFiles = { backups: [], added: [] };
  await turbowalk(
    settingsPath,
    (entries) => {
      for (const entry of entries) {
        if (entry.isDirectory) {
          continue;
        }
        if (entry.filePath.endsWith(`.${id}`)) {
          backupFiles.backups.push(entry.filePath);
        } else if (entry.filePath.endsWith(`.${id}${ADDED_MARKER}`)) {
          backupFiles.added.push(entry.filePath);
        }
      }
    },
    { recurse: true },
  );
  return backupFiles;
};

const removeIfExistsAsync = async (filePath: string): Promise<void> => {
  try {
    await rm(filePath, { force: true });
  } catch {
    /* empty */
  }
};

export const readSettingsContentAsync = async (
  entry: ModOptionsEntry,
): Promise<string> => {
  const filePath = getModOptionFilePath(entry.type, entry.path);
  return filePath ? await readFile(filePath, "base64") : "";
};

export const overrideModOptionsAsync = async (
  mod: types.IMod,
  modOptions: PersistentModOptionsEntry[],
): Promise<void> => {
  const id = getBackupId(mod);

  for (const modOption of modOptions) {
    const filePath = getModOptionFilePath(modOption.type, modOption.path);
    if (!filePath) continue;
    await fs.ensureDirAsync(path.dirname(filePath));

    const backupPath = `${filePath}.${id}`;
    const addedPath = `${backupPath}${ADDED_MARKER}`;
    // Applied again, the file is the collection's own and the user's original is already kept
    const isBackedUp =
      (await getPathExistsAsync(backupPath)) ||
      (await getPathExistsAsync(addedPath));
    if (!isBackedUp) {
      try {
        await rename(filePath, backupPath);
      } catch (err) {
        // Without a backup the user's file would be lost, only a missing one is fine
        if (!isFileNotFoundError(err)) {
          throw err;
        }
        await writeFile(addedPath, "");
      }
    }
    await writeFile(filePath, modOption.contentBase64, "base64");
  }
};

export const hasBackupModOptionsAsync = async (
  mod: types.IMod,
): Promise<boolean> => {
  const { backups, added } = await findBackupFilesAsync(mod);
  return backups.length > 0 || added.length > 0;
};

export const restoreOriginalModOptionsAsync = async (
  mod: types.IMod,
): Promise<void> => {
  const id = getBackupId(mod);
  const { backups, added } = await findBackupFilesAsync(mod);
  for (const fullPath of backups) {
    const originalPath = fullPath.slice(0, fullPath.length - id.length - 1);
    await removeIfExistsAsync(originalPath);
    try {
      await rename(fullPath, originalPath);
    } catch {
      /* empty */
    }
  }
  for (const markerPath of added) {
    const addedPath = markerPath.slice(
      0,
      markerPath.length - id.length - ADDED_MARKER.length - 1,
    );
    await removeIfExistsAsync(addedPath);
    await removeIfExistsAsync(markerPath);
  }
};

export const removeOriginalModOptionsAsync = async (
  mod: types.IMod,
): Promise<void> => {
  const { backups, added } = await findBackupFilesAsync(mod);
  for (const file of [...backups, ...added]) {
    await removeIfExistsAsync(file);
  }
};

export const getSpecialSettings = (): ModOptionsStorage => {
  const specialSettingsDictionary: ModOptionsStorage = {
    ["ButterLib"]: {
      name: "ButterLib/Options.json",
      path: "ButterLib/Options.json",
      type: ModOptionsEntryType.Special,
    },
  };
  return specialSettingsDictionary;
};

export const getGlobalSettingsAsync = async (): Promise<ModOptionsStorage> => {
  const globalSettings: [string, ModOptionsEntry][] = [];
  const gsPath = path.join(getSettingsPath(), "Global");
  await fs.ensureDirAsync(gsPath);
  await turbowalk(
    gsPath,
    (entries) => {
      const settingFiles = entries.filter((entry) => !entry.isDirectory);
      for (const file of settingFiles) {
        const fullPath = file.filePath;
        const relativePath = path.relative(gsPath, fullPath);
        const name = path.basename(relativePath);
        const extension = path.extname(relativePath);
        const modName = name.slice(0, name.length - extension.length);
        globalSettings.push([
          modName,
          {
            name: relativePath,
            path: relativePath,
            type: ModOptionsEntryType.Global,
          },
        ]);
      }
    },
    { recurse: true },
  );
  return Object.fromEntries(globalSettings);
};

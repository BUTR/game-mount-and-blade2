import { fs, types, util } from "vortex-api";
import turbowalk from "turbowalk";
import path from "path";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  ModOptionsEntry,
  ModOptionsEntryType,
  ModOptionsStorage,
  PersistentModOptionsEntry,
} from "./types";

export const getSettingsPath = (): string => {
  return path.join(
    util.getVortexPath("documents"),
    "Mount and Blade II Bannerlord",
    "Configs",
    "ModSettings",
  );
};

const getBackupId = (mod: types.IMod): string => `bak.vortex.${mod.archiveId}}`;

const getModOptionFilePath = (type: string, relativePath: string): string => {
  switch (type) {
    case "global":
      return path.join(getSettingsPath(), "Global", relativePath);
    case "special":
      return path.join(getSettingsPath(), relativePath);
    default:
      return "";
  }
};

const findBackupFilesAsync = async (mod: types.IMod): Promise<string[]> => {
  const id = getBackupId(mod);
  const settingsPath = getSettingsPath();
  await fs.ensureDirAsync(settingsPath);
  const backupFiles: string[] = [];
  await turbowalk(
    settingsPath,
    (entries) => {
      for (const entry of entries) {
        if (!entry.isDirectory && entry.filePath.endsWith(`.${id}`)) {
          backupFiles.push(entry.filePath);
        }
      }
    },
    { recurse: true },
  );
  return backupFiles;
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
    try {
      await rename(filePath, `${filePath}.${id}`);
    } catch {
      /* empty */
    }
    await writeFile(filePath, modOption.contentBase64, "base64");
  }
};

export const hasBackupModOptionsAsync = async (
  mod: types.IMod,
): Promise<boolean> => {
  const backupFiles = await findBackupFilesAsync(mod);
  return backupFiles.length > 0;
};

export const restoreOriginalModOptionsAsync = async (
  mod: types.IMod,
): Promise<void> => {
  const id = getBackupId(mod);
  const backupFiles = await findBackupFilesAsync(mod);
  for (const fullPath of backupFiles) {
    const originalPath = fullPath.slice(0, fullPath.length - id.length - 1);
    try {
      await rm(originalPath);
    } catch {
      /* empty */
    }
    try {
      await rename(fullPath, originalPath);
    } catch {
      /* empty */
    }
  }
};

export const removeOriginalModOptionsAsync = async (
  mod: types.IMod,
): Promise<void> => {
  const backupFiles = await findBackupFilesAsync(mod);
  for (const file of backupFiles) {
    try {
      await rm(file);
    } catch {
      /* empty */
    }
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
  const globalSettingsDictionary: ModOptionsStorage = {};
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
        globalSettingsDictionary[modName] = {
          name: relativePath,
          path: relativePath,
          type: ModOptionsEntryType.Global,
        };
      }
    },
    { recurse: true },
  );
  return globalSettingsDictionary;
};

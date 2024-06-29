import { fs, types, util } from 'vortex-api';
import turbowalk from 'turbowalk';
import path from 'path';
import { ModOptionsEntry, ModOptionsEntryType, ModOptionsStorage, PersistentModOptionsEntry } from './types';

export const getSettingsPath = (): string => {
  return path.join(util.getVortexPath('documents'), 'Mount and Blade II Bannerlord', 'Configs', 'ModSettings');
};

export const readSettingsContentAsync = async (entry: ModOptionsEntry): Promise<string> => {
  switch (entry.type) {
    case 'global':
      return await fs.readFileAsync(path.join(getSettingsPath(), 'Global', entry.path), 'base64');
    case 'special':
      return await fs.readFileAsync(path.join(getSettingsPath(), entry.path), 'base64');
    default:
      return '';
  }
};

// TODO: Replace with async?
export const readSettingsContent = (entry: ModOptionsEntry): string => {
  switch (entry.type) {
    case 'global':
      return fs.readFileSync(path.join(getSettingsPath(), 'Global', entry.path), 'base64');
    case 'special':
      return fs.readFileSync(path.join(getSettingsPath(), entry.path), 'base64');
    default:
      return '';
  }
};

export const overrideModOptions = async (mod: types.IMod, modOptions: PersistentModOptionsEntry[]): Promise<void> => {
  const id = `bak.vortex.${mod.archiveId}}`;

  for (const modOption of modOptions) {
    switch (modOption.type) {
      case 'global':
        {
          const filePath = path.join(getSettingsPath(), 'Global', modOption.path);
          await fs.ensureDirAsync(path.dirname(filePath));
          try {
            await fs.renameAsync(filePath, `${filePath}.${id}`);
          } catch (err) {
            /* empty */
          }
          await fs.writeFileAsync(filePath, modOption.contentBase64, 'base64');
        }
        break;
      case 'special':
        {
          const filePath = path.join(getSettingsPath(), modOption.path);
          try {
            await fs.renameAsync(filePath, `${filePath}.${id}`);
          } catch (err) {
            /* empty */
          }
          await fs.writeFileAsync(filePath, modOption.contentBase64, 'base64');
        }
        break;
    }
  }
};

export const hasBackupModOptions = async (mod: types.IMod): Promise<boolean> => {
  const id = `bak.vortex.${mod.archiveId}}`;

  let hasBackup = false;
  await turbowalk(
    getSettingsPath(),
    (entries) => {
      const backupFiles = entries.filter((entry) => !entry.isDirectory && entry.filePath.endsWith(`.${id}`));
      hasBackup = backupFiles.length > 0;
    },
    { recurse: true }
  );
  return hasBackup;
};

export const restoreOriginalModOptions = async (mod: types.IMod): Promise<void> => {
  const id = `bak.vortex.${mod.archiveId}}`;

  const filesToRemove: { fullPath: string; originalPath: string }[] = [];
  await turbowalk(
    getSettingsPath(),
    (entries) => {
      const backupFiles = entries.filter((entry) => !entry.isDirectory && entry.filePath.endsWith(`.${id}`));
      for (const file of backupFiles) {
        const fullPath = file.filePath;
        const originalPath = fullPath.slice(0, fullPath.length - id.length - 1);
        filesToRemove.push({ fullPath, originalPath });
      }
    },
    { recurse: true }
  );
  for (const file of filesToRemove) {
    const { fullPath, originalPath } = file;
    try {
      await fs.removeAsync(originalPath);
    } catch {
      /* empty */
    }
    try {
      await fs.renameAsync(fullPath, originalPath);
    } catch {
      /* empty */
    }
  }
};

export const removeOriginalModOptions = async (mod: types.IMod): Promise<void> => {
  const id = `bak.vortex.${mod.archiveId}}`;

  const filesToRemove: string[] = [];
  await turbowalk(
    getSettingsPath(),
    (entries) => {
      const backupFiles = entries.filter((entry) => !entry.isDirectory && entry.filePath.endsWith(`.${id}`));
      for (const file of backupFiles) {
        const fullPath = file.filePath;
        filesToRemove.push(fullPath);
      }
    },
    { recurse: true }
  );
  for (const file of filesToRemove) {
    try {
      await fs.removeAsync(file);
    } catch {
      /* empty */
    }
  }
};

export const getSpecialSettings = (): ModOptionsStorage => {
  const specialSettingsDictionary: ModOptionsStorage = {
    ['ButterLib']: {
      name: 'ButterLib/Options.json',
      path: 'ButterLib/Options.json',
      type: ModOptionsEntryType.Special,
    },
  };
  return specialSettingsDictionary;
};

export const getGlobalSettings = async (): Promise<ModOptionsStorage> => {
  const globalSettingsDictionary: ModOptionsStorage = {};
  const gsPath = path.join(getSettingsPath(), 'Global');
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
    { recurse: true }
  );
  return globalSettingsDictionary;
};

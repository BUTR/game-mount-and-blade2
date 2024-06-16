import { fs, types, util } from 'vortex-api';
import turbowalk from 'turbowalk';
import path from 'path';
import { ModOptionsEntry, ModOptionsEntryType, ModOptionsStorage, PersistentModOptionsEntry } from './types';

export const getSettingsPath = (): string => {
  return path.join(util.getVortexPath('documents'), 'Mount and Blade II Bannerlord', 'Configs', 'ModSettings');
};

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

export const writeSettingsContent = (entry: PersistentModOptionsEntry): void => {
  switch (entry.type) {
    case 'global':
      fs.writeFileSync(path.join(getSettingsPath(), 'Global', entry.path), entry.contentBase64, 'base64');
      break;
    case 'special':
      fs.writeFileSync(path.join(getSettingsPath(), entry.path), entry.contentBase64, 'base64');
      break;
  }
};

export const overrideModOptions = async (mod: types.IMod, modOptions: PersistentModOptionsEntry[]): Promise<void> => {
  const id = `bak.vortex.${mod.archiveId}}`;

  for (const modOption of modOptions) {
    switch (modOption.type) {
      case 'global':
        {
          const filePath = path.join(getSettingsPath(), 'Global', modOption.path);
          fs.ensureDirSync(path.dirname(filePath));
          try {
            fs.accessSync(filePath, fs.constants.F_OK);
            await fs.renameAsync(filePath, `${filePath}.${id}`);
          } catch (err) {
            /* empty */
          }
          fs.writeFileSync(filePath, modOption.contentBase64, 'base64');
        }
        break;
      case 'special':
        {
          const filePath = path.join(getSettingsPath(), modOption.path);
          try {
            fs.accessSync(filePath, fs.constants.F_OK);
            await fs.renameAsync(filePath, `${filePath}.${id}`);
          } catch (err) {
            /* empty */
          }
          fs.writeFileSync(filePath, modOption.contentBase64, 'base64');
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

  await turbowalk(
    getSettingsPath(),
    (entries) => {
      const backupFiles = entries.filter((entry) => !entry.isDirectory && entry.filePath.endsWith(`.${id}`));
      for (const file of backupFiles) {
        const fullPath = file.filePath;
        const originalPath = fullPath.slice(0, fullPath.length - id.length - 1);
        try {
          fs.removeSync(originalPath);
        } catch {
          /* empty */
        }
        fs.renameAsync(fullPath, originalPath).catch(() => {});
      }
    },
    { recurse: true }
  );
};

export const removeOriginalModOptions = async (mod: types.IMod): Promise<void> => {
  const id = `bak.vortex.${mod.archiveId}}`;

  await turbowalk(
    getSettingsPath(),
    (entries) => {
      const backupFiles = entries.filter((entry) => !entry.isDirectory && entry.filePath.endsWith(`.${id}`));
      for (const file of backupFiles) {
        const fullPath = file.filePath;
        try {
          fs.removeSync(fullPath);
        } catch {
          /* empty */
        }
      }
    },
    { recurse: true }
  );
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

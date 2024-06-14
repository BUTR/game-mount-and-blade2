import { fs, util } from 'vortex-api';
import turbowalk from 'turbowalk';
import path from 'path';
import { ModOptionsEntry, ModOptionsEntryType, ModOptionsStorage, PersistentModOptionsEntry } from '.';

export const getSettingsPath = () => {
  return path.join(util.getVortexPath('documents'), 'Mount and Blade II Bannerlord', 'Configs', 'ModSettings');
};

export const readSettingsContent = (entry: ModOptionsEntry) => {
  switch (entry.type) {
    case 'global':
      return fs.readFileSync(path.join(getSettingsPath(), 'Global', entry.path), 'base64');
    case 'special':
      return fs.readFileSync(path.join(getSettingsPath(), entry.path), 'base64');
    default:
      return '';
  }
};

export const writeSettingsContent = (entry: PersistentModOptionsEntry) => {
  switch (entry.type) {
    case 'global':
      fs.writeFileSync(path.join(getSettingsPath(), 'Global', entry.path), entry.contentBase64, 'base64');
      break;
    case 'special':
      fs.writeFileSync(path.join(getSettingsPath(), entry.path), entry.contentBase64, 'base64');
      break;
  }
};

export const getSpecialSettings = async () => {
  const specialSettingsDictionary: ModOptionsStorage = {
    ['ButterLib']: {
      name: 'ButterLib/Options.json',
      path: 'ButterLib/Options.json',
      type: ModOptionsEntryType.Special,
    },
  };
  return specialSettingsDictionary;
};

export const getGlobalSettings = async () => {
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

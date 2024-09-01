import { gte } from 'semver';
import { selectors, types, util } from 'vortex-api';
import { GAME_ID } from '../common';
import { hasPersistentBannerlordMods } from '../vortex';
import { IBannerlordMod, IBannerlordModStorage } from '../types';

export const isModActive = (profile: types.IProfile, mod: IBannerlordMod): boolean => {
  return profile.modState[mod.id]?.enabled ?? false;
};
const isMod = (mod: IBannerlordMod, moduleId: string): boolean => {
  return mod.attributes?.subModsIds?.includes(moduleId) ?? false;
};

export const findMod = (mods: IBannerlordModStorage, moduleId: string): IBannerlordMod | undefined => {
  const foundMods: IBannerlordMod[] = Object.values(mods).filter((mod: IBannerlordMod) => isMod(mod, moduleId));

  if (foundMods.length === 0) return undefined;

  if (foundMods.length === 1) return foundMods[0];

  return foundMods.reduce<IBannerlordMod | undefined>((prev: IBannerlordMod | undefined, iter: IBannerlordMod) => {
    if (!prev) {
      return iter;
    }
    return gte(iter.attributes?.version ?? '0.0.0', prev.attributes?.version ?? '0.0.0') ? iter : prev;
  }, undefined);
};

export const findModDownload = (api: types.IExtensionApi, modId: number): string | undefined => {
  const state = api.getState();
  const downloadedFiles = state.persistent.downloads.files;
  if (downloadedFiles === undefined) {
    return undefined;
  }

  const modFiles = Object.entries(downloadedFiles)
    .filter(([, download]) => download.game.includes(GAME_ID))
    .filter(([, download]) => download.modInfo?.['nexus']?.modInfo?.mod_id === modId)
    .sort(([, downloadA], [, downloadB]) => downloadA.fileTime - downloadB.fileTime);

  if (modFiles.length === 0) {
    return undefined;
  }

  const [downloadId, download] = modFiles[0]!;

  return downloadId;
};

export const isActiveMod = (api: types.IExtensionApi, moduleId: string): boolean => {
  const state = api.getState();

  if (!hasPersistentBannerlordMods(state.persistent)) return false;

  const mods = state.persistent.mods.mountandblade2bannerlord ?? {};
  const foundMods: IBannerlordMod[] = Object.values(mods).filter((mod: IBannerlordMod) => isMod(mod, moduleId));

  if (foundMods.length === 0) {
    return false;
  }

  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  return foundMods.filter((x) => isModActive(profile, x)).length >= 1;
};

import { selectors, types } from "vortex-api";
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import { GAME_ID } from "../common";
import { hasPersistentBannerlordMods } from "../vortex";
import { IBannerlordMod, IBannerlordModStorage } from "../types";

export const isModActive = (
  profile: types.IProfile | undefined,
  mod: IBannerlordMod,
): boolean => {
  // Warning: modState is not guaranteed to be present in the profile
  return profile?.modState?.[mod.id]?.enabled ?? false;
};
const isMod = (mod: IBannerlordMod, moduleId: string): boolean => {
  return mod.attributes?.subModsIds?.includes(moduleId) ?? false;
};

export const findMod = (
  mods: IBannerlordModStorage,
  moduleId: string,
): IBannerlordMod | undefined => {
  const foundMods: IBannerlordMod[] = Object.values(mods).filter(
    (mod: IBannerlordMod) => isMod(mod, moduleId),
  );

  if (foundMods.length === 0) return undefined;

  if (foundMods.length === 1) return foundMods[0];

  return foundMods.reduce<IBannerlordMod | undefined>(
    (prev: IBannerlordMod | undefined, iter: IBannerlordMod) => {
      if (!prev) {
        return iter;
      }
      const compareResult = BannerlordModuleManager.compareVersions(
        BannerlordModuleManager.parseApplicationVersion(
          iter.attributes?.version ?? "",
        ),
        BannerlordModuleManager.parseApplicationVersion(
          prev.attributes?.version ?? "",
        ),
      );
      switch (compareResult) {
        case 1:
          return iter;
        case -1:
          return prev;
        default:
          return iter;
      }
    },
    undefined,
  );
};

export const findModDownload = (
  api: types.IExtensionApi,
  modId: number,
): string | undefined => {
  const state = api.getState();
  const downloadedFiles = state.persistent.downloads.files;
  if (downloadedFiles === undefined) {
    return undefined;
  }

  const modFiles = Object.entries(downloadedFiles)
    .filter(([, download]) => download.game.includes(GAME_ID))
    .filter(([, download]) => download.modInfo?.["nexus"]?.ids?.modId === modId)
    .sort(
      ([, downloadA], [, downloadB]) => downloadA.fileTime - downloadB.fileTime,
    );

  if (modFiles.length === 0) {
    return undefined;
  }

  const [downloadId, _download] = modFiles[0]!;

  return downloadId;
};

export const isActiveMod = (
  api: types.IExtensionApi,
  moduleId: string,
): boolean => {
  const state = api.getState();

  if (!hasPersistentBannerlordMods(state.persistent)) return false;

  const mods = state.persistent.mods.mountandblade2bannerlord ?? {};
  const foundMods: IBannerlordMod[] = Object.values(mods).filter(
    (mod: IBannerlordMod) => isMod(mod, moduleId),
  );

  if (foundMods.length === 0) {
    return false;
  }

  const profile = selectors.activeProfile(state);
  return foundMods.filter((x) => isModActive(profile, x)).length >= 1;
};

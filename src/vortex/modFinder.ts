import { types } from "vortex-api";
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import {
  GAME_ID,
  OBFUSCATED_BINARIES,
  STEAM_BINARIES_ON_XBOX,
  SUB_MODS_IDS,
} from "../common";
import { bselectors } from "../selectors";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IStateWithBannerlord,
} from "../types";

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

export const findModByPredicate = (
  mods: IBannerlordModStorage,
  predicate: (mod: IBannerlordMod) => boolean,
): IBannerlordMod | undefined => {
  const foundMods: IBannerlordMod[] = Object.values(mods).filter(predicate);

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

export const findMod = (
  mods: IBannerlordModStorage,
  moduleId: string,
): IBannerlordMod | undefined => {
  return findModByPredicate(mods, (mod) => isMod(mod, moduleId));
};

export const findModDownload = (
  api: types.IExtensionApi,
  modId: number,
): string | undefined => {
  const state = api.getState<IStateWithBannerlord>();
  const downloadedFiles = bselectors.downloadFiles(state);
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

type ModIdResult = {
  id: string;
  source: string | undefined;
  hasSteamBinariesOnXbox: boolean;
  hasObfuscatedBinaries: boolean;
};

/**
 * I have no idea what to do if we have multiple mods that provide the same Module
 */
export const getModuleAttributes = (
  api: types.IExtensionApi,
  moduleId: string,
): ModIdResult[] => {
  const state = api.getState<IStateWithBannerlord>();
  const gameMods = bselectors.bannerlordMods(state);
  const modIds = Object.values(gameMods).reduce<ModIdResult[]>((arr, mod) => {
    if (!mod.attributes || mod.attributes[SUB_MODS_IDS] === undefined) {
      return arr;
    }
    const subModsIds: Set<string> = new Set(mod.attributes[SUB_MODS_IDS]);
    if (subModsIds.has(moduleId)) {
      arr.push({
        id: mod.id,
        source: mod.attributes["source"],
        hasSteamBinariesOnXbox: mod.attributes[STEAM_BINARIES_ON_XBOX] ?? false,
        hasObfuscatedBinaries: mod.attributes[OBFUSCATED_BINARIES] ?? false,
      });
    }

    return arr;
  }, []);

  return modIds;
};

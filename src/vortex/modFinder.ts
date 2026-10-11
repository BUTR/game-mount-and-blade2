import { types } from "vortex-api";
import {
  GAME_ID,
  OBFUSCATED_BINARIES,
  STEAM_BINARIES_ON_XBOX,
  SUB_MODS_IDS,
} from "../common";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";

/**
 * Extracts Nexus Mods IDs (modId and fileId) from download metadata.
 * Vortex stores these in different metadata locations depending on the source
 * (mirrors lookupFromDownload in dependencies.ts, which vortex-api exports only from v2.2+).
 */
const getDownloadNexusIds = (
  download: types.IDownload,
): { modId: number; fileId: number } => {
  const modInfo = download.modInfo as
    | {
        meta?: { details?: { modId?: unknown; fileId?: unknown } };
        nexus?: { ids?: { modId?: unknown; fileId?: unknown } };
        ids?: { modId?: unknown; fileId?: unknown };
      }
    | undefined;
  return {
    modId: Number(
      modInfo?.meta?.details?.modId ??
        modInfo?.nexus?.ids?.modId ??
        modInfo?.ids?.modId,
    ),
    fileId: Number(
      modInfo?.meta?.details?.fileId ??
        modInfo?.nexus?.ids?.fileId ??
        modInfo?.ids?.fileId,
    ),
  };
};

/**
 * Finds the most recent completed download for a Nexus Mods mod, optionally matching a specific file.
 *
 * @param fileId Specific file ID to find, or omitted to match any download for the mod.
 */
export const findModDownload = (
  api: types.IExtensionApi,
  modId: number,
  fileId?: number,
): string | undefined => {
  const state = api.getState<IStateWithBannerlord>();

  const downloadedFiles = bselectors.downloadFiles(state);
  return Object.entries(downloadedFiles)
    .filter(([, download]) => {
      if (download.state !== "finished" || !download.game.includes(GAME_ID)) {
        return false;
      }
      const ids = getDownloadNexusIds(download);
      return (
        ids.modId === modId && (fileId === undefined || ids.fileId === fileId)
      );
    })
    .sort(
      ([, downloadA], [, downloadB]) => downloadB.fileTime - downloadA.fileTime,
    )[0]?.[0];
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

import { createSelector } from "reselect";
import { selectors, types } from "vortex-api";
import { GAME_ID } from "./common";
import { findBLSEMod } from "./blse/utils";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IStateWithBannerlord,
  VortexLoadOrderStorage,
} from "./types";

// ============================================================================
// Bannerlord Mods
// ============================================================================

const bannerlordMods = (state: IStateWithBannerlord): IBannerlordModStorage =>
  state.persistent.mods[GAME_ID] ?? {};

const bannerlordModById = (
  state: IStateWithBannerlord,
  modId: string,
): IBannerlordMod | undefined => state.persistent.mods[GAME_ID]?.[modId];

// ============================================================================
// Load Order
// ============================================================================

const bannerlordLoadOrder = (
  state: IStateWithBannerlord,
  profileId: string | undefined,
): VortexLoadOrderStorage =>
  profileId !== undefined
    ? (state.persistent.loadOrder?.[profileId] ?? [])
    : [];

const bannerlordActiveLoadOrder = createSelector(
  [
    selectors.activeProfile,
    (state: IStateWithBannerlord) => state.persistent.loadOrder,
  ],
  (profile, loadOrderMap): VortexLoadOrderStorage =>
    profile !== undefined ? (loadOrderMap?.[profile.id] ?? []) : [],
);

// ============================================================================
// Downloads
// ============================================================================

const downloadFiles = (state: types.IState): Record<string, types.IDownload> =>
  state.persistent.downloads.files ?? {};

// ============================================================================
// Bannerlord Settings (per-profile)
// ============================================================================

const sortOnDeployForProfile = (
  state: IStateWithBannerlord,
  profileId: string,
): boolean | null => state.settings[GAME_ID]?.sortOnDeploy?.[profileId] ?? null;

const fixCommonIssuesForProfile = (
  state: IStateWithBannerlord,
  profileId: string,
): boolean | null =>
  state.settings[GAME_ID]?.fixCommonIssues?.[profileId] ?? null;

const betaSortingForProfile = (
  state: IStateWithBannerlord,
  profileId: string,
): boolean | null => state.settings[GAME_ID]?.betaSorting?.[profileId] ?? null;

const saveNameForProfile = (
  state: IStateWithBannerlord,
  profileId: string,
): string | null => {
  let saveId = state.settings[GAME_ID]?.saveName?.[profileId] ?? null;
  if (saveId === "No Save") {
    saveId = null;
  }
  return saveId;
};

// ============================================================================
// Session State
// ============================================================================

const useSteamBinariesOnXbox = (state: IStateWithBannerlord): boolean =>
  state.session[GAME_ID]?.useSteamBinariesOnXbox ?? false;

// ============================================================================
// Interface Settings
// ============================================================================

const bannerlordPrimaryTool = (
  state: IStateWithBannerlord,
): string | undefined => state.settings.interface?.primaryTool?.[GAME_ID];

// ============================================================================
// BLSE
// ============================================================================

const blseMod = createSelector(
  [bannerlordMods],
  (mods): IBannerlordMod | undefined => findBLSEMod(mods),
);

// ============================================================================

export const bselectors = {
  bannerlordMods,
  bannerlordModById,
  bannerlordLoadOrder,
  bannerlordActiveLoadOrder,
  downloadFiles,
  sortOnDeployForProfile,
  fixCommonIssuesForProfile,
  betaSortingForProfile,
  saveNameForProfile,
  useSteamBinariesOnXbox,
  bannerlordPrimaryTool,
  blseMod,
};

import { createSelector } from "reselect";
import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "./common";
import { findBLSEMod } from "./blse/modType";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IStateWithBannerlord,
  VortexLoadOrderStorage,
} from "./types";
import { GameMode } from "./settings/types";

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

/**
 * The profile's type, Singleplayer until it is set
 */
const gameModeForProfile = (
  state: IStateWithBannerlord,
  profileId: string,
): GameMode =>
  state.persistent.profiles[profileId]?.features?.[
    MULTIPLAYER_PROFILE_FEATURE
  ] === true
    ? "multiplayer"
    : "singleplayer";

/**
 * The active profile's mode, singleplayer without an active profile
 */
const activeGameMode = (state: IStateWithBannerlord): GameMode => {
  const profile = selectors.activeProfile(state);
  return profile !== undefined
    ? gameModeForProfile(state, profile.id)
    : "singleplayer";
};

/**
 * The primary tool remembered for the mode: undefined when none was chosen yet, null for the game itself
 */
const modePrimaryTool = (
  state: IStateWithBannerlord,
  gameMode: GameMode,
): string | null | undefined =>
  state.settings[GAME_ID]?.modePrimaryTool?.[gameMode];

const NO_HIDDEN_TOOLS: Record<string, true> = {};

const modeHiddenTools = (state: IStateWithBannerlord): Record<string, true> =>
  state.settings[GAME_ID]?.modeHiddenTools ?? NO_HIDDEN_TOOLS;

// ============================================================================
// Session State
// ============================================================================

const useSteamBinariesOnXbox = (state: IStateWithBannerlord): boolean =>
  state.session[GAME_ID]?.useSteamBinariesOnXbox ?? false;

// ============================================================================
// Interface Settings
// ============================================================================

/**
 * null when the game itself was chosen as the launcher
 */
const bannerlordPrimaryTool = (
  state: IStateWithBannerlord,
): string | null | undefined =>
  state.settings.interface?.primaryTool?.[GAME_ID];

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
  gameModeForProfile,
  activeGameMode,
  modePrimaryTool,
  modeHiddenTools,
  useSteamBinariesOnXbox,
  bannerlordPrimaryTool,
  blseMod,
};

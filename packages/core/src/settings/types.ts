import { types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";

/**
 * A profile's type, which side of the game it manages. Each type lists its own modules, keeps its own load order and
 * has its own tools
 */
export type GameMode = "singleplayer" | "multiplayer";

export interface IBannerlordSettings {
  /**
   * The primary tool Play launches in each mode, restored when switching to it. null launches the game itself
   */
  modePrimaryTool?: Partial<Record<GameMode, string | null>>;
  /**
   * Tools hidden because they belong to the other mode, shown again when switching back.
   * Tools the user hid themselves are never listed, so they stay hidden
   */
  modeHiddenTools?: Record<string, true>;
  sortOnDeploy: Record<string, boolean>;
  fixCommonIssues: Record<string, boolean>;
  betaSorting: Record<string, boolean>;
}

export interface ISettingsWithBannerlord extends types.ISettings {
  [GAME_ID]?: IBannerlordSettings;
}

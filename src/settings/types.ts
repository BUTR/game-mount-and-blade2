import { types } from "vortex-api";
import { GAME_ID } from "../common";

export interface IBannerlordSettings {
  saveName: Record<string, string | null>;
  sortOnDeploy: Record<string, boolean>;
  fixCommonIssues: Record<string, boolean>;
  betaSorting: Record<string, boolean>;
}

export interface ISettingsWithBannerlord extends types.ISettings {
  [GAME_ID]?: IBannerlordSettings;
}

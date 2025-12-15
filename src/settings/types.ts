import { types } from "vortex-api";
import { GAME_ID } from "../common";

export interface IBannerlordSettings {
  saveName: {
    [profileId: string]: string | null;
  };
  sortOnDeploy: {
    [profileId: string]: boolean;
  };
  fixCommonIssues: {
    [profileId: string]: boolean;
  };
  betaSorting: {
    [profileId: string]: boolean;
  };
}

export interface ISettingsWithBannerlord extends types.ISettings {
  [GAME_ID]?: IBannerlordSettings;
}

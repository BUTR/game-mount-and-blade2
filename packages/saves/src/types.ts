import { GAME_ID } from "@bannerlord/core/common";
import { IStateWithBannerlord } from "@bannerlord/core/types";

/**
 * The Saves page's part of the extension's settings
 */
export interface ISavesSettings {
  /**
   * The save selected for each profile, by profile id
   */
  saveName: Record<string, string | null>;
}

export interface IStateWithSaves extends IStateWithBannerlord {
  settings: IStateWithBannerlord["settings"] & {
    [GAME_ID]?: ISavesSettings;
  };
}

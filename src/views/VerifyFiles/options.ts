import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../../common";
import { getVerifyStore } from "../../verifyFiles/verify";

export const VERIFY_FILES_PAGE_ID = "bannerlord-verify-files";

/**
 * In the game's menu between Profiles (70) and Game settings (80), the game card and the Mods toolbar open it too
 */
export class VerifyFilesPageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;

  public id = VERIFY_FILES_PAGE_ID;
  public group: "dashboard" | "global" | "per-game" | "support" | "hidden" =
    "per-game";

  public priority = 75;

  constructor(context: types.IExtensionContext) {
    this.context = context;
  }

  public visible = (): boolean => {
    if (!this.context.api.store) {
      return false;
    }
    const state = this.context.api.getState();
    return (
      selectors.activeGameId(state) === GAME_ID &&
      getVerifyStore(state) !== undefined
    );
  };
  public props = (): {} => ({});
}

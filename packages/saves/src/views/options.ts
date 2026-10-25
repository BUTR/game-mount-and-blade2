import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { bselectors } from "@bannerlord/core/selectors";
import { IStateWithBannerlord } from "@bannerlord/core/types";

export class SavePageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;

  public id = "bannerlord-saves";
  public hotkey = "A";
  public group: "dashboard" | "global" | "per-game" | "support" | "hidden" =
    "per-game";

  public priority = 50;

  constructor(context: types.IExtensionContext) {
    this.context = context;
  }

  /**
   * Saves are singleplayer only
   */
  public visible = (): boolean => {
    if (!this.context.api.store) {
      return false;
    }
    const state = this.context.api.getState<IStateWithBannerlord>();
    return (
      selectors.activeGameId(state) === GAME_ID &&
      bselectors.activeGameMode(state) === "singleplayer"
    );
  };
  public props = (): {} => ({});
}

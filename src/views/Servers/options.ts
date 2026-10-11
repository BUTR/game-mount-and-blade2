import { selectors, types } from "vortex-api";
import { GAME_ID } from "../../common";

/**
 * Custom SVG icon representing two stacked server rack units, aligned to a 16px display grid:
 * 1.5 units of the 24-unit viewBox corresponds to 1 pixel, aligning sharp edges to whole pixels
 * to avoid anti-aliasing blur when rendered at 16x16px.
 */
const SERVERS_ICON_PATH =
  // Upper unit frame walls and indicator lights
  "M3 1.5H21V3H3Z" +
  "M3 9H21V10.5H3Z" +
  "M3 3H4.5V9H3Z" +
  "M19.5 3H21V9H19.5Z" +
  "M6 4.5H9V7.5H6Z" +
  "M10.5 4.5H13.5V7.5H10.5Z" +
  // Lower unit frame walls and indicator lights
  "M3 13.5H21V15H3Z" +
  "M3 21H21V22.5H3Z" +
  "M3 15H4.5V21H3Z" +
  "M19.5 15H21V21H19.5Z" +
  "M6 16.5H9V19.5H6Z" +
  "M10.5 16.5H13.5V19.5H10.5Z";

export class ServersPageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;

  public id = "bannerlord-servers";
  /**
   * SVG path for the Modern UI navigation menu item (supported in Vortex 2.x).
   */
  public mdi = SERVERS_ICON_PATH;
  public group: "dashboard" | "global" | "per-game" | "support" | "hidden" =
    "per-game";

  constructor(context: types.IExtensionContext) {
    this.context = context;
  }

  /**
   * Shown for every profile type, joining a server switches to a Multiplayer profile first
   */
  public visible = (): boolean => {
    if (!this.context.api.store) {
      return false;
    }
    return selectors.activeGameId(this.context.api.getState()) === GAME_ID;
  };
  public props = (): {} => ({});
}

import { selectors, types } from "vortex-api";
import { GAME_ID } from "../../common";
import { VortexLauncherManager } from "../../utils";

export class SavePageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;
  private launcherManager: VortexLauncherManager;

  public id = 'bannerlord-saves';
  public hotkey = 'A';
  public group: 'dashboard' | 'global' | 'per-game' | 'support' | 'hidden' = 'per-game';

  constructor(context: types.IExtensionContext, launcherManager: VortexLauncherManager) {
    this.context = context;
    this.launcherManager = launcherManager;
  }

  public visible = () => {
    if (!this.context.api.store) {
      return false;
    }
    return selectors.activeGameId(this.context.api.getState()) === GAME_ID;
  };
  public props = () => ({
    context: this.context,
    t: this.context.api.translate,
    launcherManager: this.launcherManager,
  });
};
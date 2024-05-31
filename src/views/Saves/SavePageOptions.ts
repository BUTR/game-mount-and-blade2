import { selectors, types } from 'vortex-api';
import { GAME_ID } from '../../common';
import { SaveManager, VortexLauncherManager } from '../../utils';

export class SavePageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;
  private launcherManager: VortexLauncherManager;
  private saveManager: SaveManager;

  public id = 'bannerlord-saves';
  public hotkey = 'A';
  public group: 'dashboard' | 'global' | 'per-game' | 'support' | 'hidden' = 'per-game';

  constructor(context: types.IExtensionContext, launcherManager: VortexLauncherManager, saveManager: SaveManager) {
    this.context = context;
    this.launcherManager = launcherManager;
    this.saveManager = saveManager;
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
    saveManager: this.saveManager,
  });
}

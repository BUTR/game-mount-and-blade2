import { selectors, types } from 'vortex-api';
import { GAME_ID } from '../../common';
import { GetLauncherManager, GetSaveManager } from '../../types';

export class SavePageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;
  private getLauncherManager: GetLauncherManager;
  private getSaveManager: GetSaveManager;

  public id = 'bannerlord-saves';
  public hotkey = 'A';
  public group: 'dashboard' | 'global' | 'per-game' | 'support' | 'hidden' = 'per-game';

  constructor(
    context: types.IExtensionContext,
    getLauncherManager: GetLauncherManager,
    getSaveManager: GetSaveManager
  ) {
    this.context = context;
    this.getLauncherManager = getLauncherManager;
    this.getSaveManager = getSaveManager;
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
    getLauncherManager: this.getLauncherManager,
    getSaveManager: this.getSaveManager,
  });
}

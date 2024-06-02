import { selectors, types } from 'vortex-api';
import { GAME_ID } from '../../common';
import { GetLauncherManager, GetLocalizationManager, GetSaveManager } from '../../types';

export class SavePageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;
  private getLauncherManager: GetLauncherManager;
  private getSaveManager: GetSaveManager;
  private getLocalizationManager: GetLocalizationManager;

  public id = 'bannerlord-saves';
  public hotkey = 'A';
  public group: 'dashboard' | 'global' | 'per-game' | 'support' | 'hidden' = 'per-game';

  constructor(
    context: types.IExtensionContext,
    getLauncherManager: GetLauncherManager,
    getSaveManager: GetSaveManager,
    getLocalizationManager: GetLocalizationManager
  ) {
    this.context = context;
    this.getLauncherManager = getLauncherManager;
    this.getSaveManager = getSaveManager;
    this.getLocalizationManager = getLocalizationManager;
  }

  public visible = () => {
    if (!this.context.api.store) {
      return false;
    }
    return selectors.activeGameId(this.context.api.getState()) === GAME_ID;
  };
  public props = () => ({
    context: this.context,
    getLauncherManager: this.getLauncherManager,
    getSaveManager: this.getSaveManager,
    getLocalizationManager: this.getLocalizationManager,
  });
}

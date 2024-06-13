import { selectors, types } from 'vortex-api';
import { GAME_ID } from '../../common';
import { SavePageProps } from '.';

export class SavePageOptions implements types.IMainPageOptions {
  private context: types.IExtensionContext;

  public id = 'bannerlord-saves';
  public hotkey = 'A';
  public group: 'dashboard' | 'global' | 'per-game' | 'support' | 'hidden' = 'per-game';

  constructor(context: types.IExtensionContext) {
    this.context = context;
  }

  public visible = () => {
    if (!this.context.api.store) {
      return false;
    }
    return selectors.activeGameId(this.context.api.getState()) === GAME_ID;
  };
  public props = (): SavePageProps => ({
    context: this.context,
  });
}

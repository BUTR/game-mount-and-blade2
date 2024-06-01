import { selectors, types } from 'vortex-api';
import { actionsSave, getSaveFromSettings } from '..';
import { GetLauncherManager } from '../../types';

export class SaveManager {
  private static instance: SaveManager;

  public static getInstance(api?: types.IExtensionApi, getLauncherManager?: GetLauncherManager): SaveManager {
    if (!SaveManager.instance) {
      if (api === undefined || getLauncherManager === undefined) {
        throw new Error('IniStructure is not context aware');
      }
      SaveManager.instance = new SaveManager(api, getLauncherManager);
    }

    return SaveManager.instance;
  }

  private api: types.IExtensionApi;
  private getLauncherManager: GetLauncherManager;

  constructor(api: types.IExtensionApi, getLauncherManager: GetLauncherManager) {
    this.api = api;
    this.getLauncherManager = getLauncherManager;
  }

  public reloadSave(): void {
    const save = this.getSave();
    this.setSave(save);
  }

  public getSave = (): string | null => {
    const state = this.api.getState();
    const profile = selectors.activeProfile(state);

    return getSaveFromSettings(state, profile.id);
  };

  public setSave = (saveId: string | null): void => {
    if (saveId === 'No Save') {
      saveId = null;
    }

    const state = this.api.getState();
    const profile = selectors.activeProfile(state);
    this.api.store?.dispatch(actionsSave.setCurrentSave(profile.id, saveId));

    const launcherManager = this.getLauncherManager();
    launcherManager.setSaveFile(saveId ?? '');
  };
}

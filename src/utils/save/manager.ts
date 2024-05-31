import { selectors, types } from 'vortex-api';
import { actionsSave, getSaveFromSettings, VortexLauncherManager } from '..';

export class SaveManager {
  private static _instance: SaveManager;

  private _api: types.IExtensionApi;
  private _manager: VortexLauncherManager;

  public static getInstance(api?: types.IExtensionApi, manager?: VortexLauncherManager): SaveManager {
    if (!SaveManager._instance) {
      if (api === undefined || manager === undefined) {
        throw new Error('IniStructure is not context aware');
      }
      SaveManager._instance = new SaveManager(api, manager);
    }

    return SaveManager._instance;
  }

  constructor(api: types.IExtensionApi, manager: VortexLauncherManager) {
    this._api = api;
    this._manager = manager;
  }

  public reloadSave(): void {
    const save = this.getSave();
    this.setSave(save);
  }

  public getSave = (): string | null => {
    const state = this._api.getState();
    const profile = selectors.activeProfile(state);

    return getSaveFromSettings(state, profile.id);
  };

  public setSave = (saveId: string | null): void => {
    if (saveId === 'No Save') {
      saveId = null;
    }

    const state = this._api.getState();
    const profile = selectors.activeProfile(state);
    this._api.store?.dispatch(actionsSave.setCurrentSave(profile.id, saveId));
    this._manager.setSaveFile(saveId ?? '');
  };
}

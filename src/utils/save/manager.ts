import { selectors, types } from 'vortex-api';
import { actionsSave } from '../save';
import { getSaveFromSettings } from '../settings';
import { VortexLauncherManager } from '../launcher';

export class SaveManager {
  private static instance: SaveManager;

  public static getInstance(api: types.IExtensionApi): SaveManager {
    if (!SaveManager.instance) {
      if (api === undefined) {
        throw new Error('IniStructure is not context aware');
      }
      SaveManager.instance = new SaveManager(api);
    }

    return SaveManager.instance;
  }

  private api: types.IExtensionApi;

  constructor(api: types.IExtensionApi) {
    this.api = api;
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

    const launcherManager = VortexLauncherManager.getInstance(this.api);
    launcherManager.setSaveFile(saveId ?? '');
  };
}

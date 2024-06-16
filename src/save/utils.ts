import { selectors, types } from 'vortex-api';
import { VortexLauncherManager } from '../launcher';
import { getSaveFromSettings } from '../settings';
import { actionsSave } from '.';

export const reloadSave = (api: types.IExtensionApi): void => {
  const state = api.getState();
  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  let save = getSaveFromSettings(state, profile.id);

  if (save === 'No Save') {
    save = null;
  }

  api.store?.dispatch(actionsSave.setCurrentSave(profile.id, save));

  const launcherManager = VortexLauncherManager.getInstance(api);
  launcherManager.setSaveFile(save ?? '');
};

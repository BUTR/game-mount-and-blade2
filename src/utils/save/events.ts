import { types } from 'vortex-api';
import { reloadSave } from './utils';

/**
 * Event function, be careful
 */
export const gamemodeActivatedSave = (api: types.IExtensionApi): void => {
  try {
    reloadSave(api);
  } catch (err) {
    api.showErrorNotification?.('Failed to reload the currect save file', err);
  }
};

import { actions, selectors, types } from 'vortex-api';
import { findBLSEMod, deployBLSE, downloadBLSE, isModActive, findBLSEDownload } from './shared';
import { GetLocalizationManager } from '../../types';
import { LocalizationManager } from '../localization';

const sendNotification = (
  api: types.IExtensionApi,
  localizationManager: LocalizationManager,
  title: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void
) => {
  const t = localizationManager.localize;

  api.sendNotification?.({
    id: 'blse-missing',
    type: 'warning',
    title: title,
    message: t('BLSE is recommended to mod Bannerlord.'),
    actions: [
      {
        title: actionTitle,
        action: action,
      },
    ],
  });
};

export const recommendBLSE = (api: types.IExtensionApi, getLocalizationManager: GetLocalizationManager) => {
  const localizationManager = getLocalizationManager();
  const t = localizationManager.localize;

  const profile = selectors.activeProfile(api.getState());

  const blseMod = findBLSEMod(api);
  if (blseMod) {
    // Found but not enabled
    const blseIsActive = isModActive(profile, blseMod);
    if (!blseIsActive) {
      const action = (dismiss: types.NotificationDismiss) => {
        api.store?.dispatch(actions.setModEnabled(profile.id, blseMod.id, true));
        deployBLSE(api).then(() => dismiss());
      };
      sendNotification(api, localizationManager, t('BLSE is not enabled'), t('Enable'), action);
      return;
    }
  }

  const blseDownload = findBLSEDownload(api);
  if (blseDownload) {
    // Downloaded but not installed
    const action = (dismiss: types.NotificationDismiss) => {
      api.events.emit('start-install-download', blseDownload, {
        allowAutoEnable: true,
      });
      deployBLSE(api).then(() => dismiss());
    };
    sendNotification(api, localizationManager, t('BLSE is not installed'), t('Install'), action);
    return;
  }

  // Non existent
  const action = (dismiss: types.NotificationDismiss) => {
    downloadBLSE(api, getLocalizationManager).then(() => dismiss());
  };
  sendNotification(api, localizationManager, t('BLSE is not installed via Vortex'), t('Get BLSE'), action);
};

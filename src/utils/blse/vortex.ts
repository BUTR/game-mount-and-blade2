import { actions, selectors, types } from 'vortex-api';
import { LocalizationManager } from '../localization';
import { deployBLSE, downloadBLSE, findBLSEDownload, findBLSEMod, isModActive } from '.';

const sendNotification = (
  api: types.IExtensionApi,
  title: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void
) => {
  const { localize: t } = LocalizationManager.getInstance(api);

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

export const recommendBLSE = (api: types.IExtensionApi) => {
  const { localize: t } = LocalizationManager.getInstance(api);

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
      sendNotification(api, t('BLSE is not enabled'), t('Enable'), action);
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
    sendNotification(api, t('BLSE is not installed'), t('Install'), action);
    return;
  }

  // Non existent
  const action = (dismiss: types.NotificationDismiss) => {
    downloadBLSE(api).then(() => dismiss());
  };
  sendNotification(api, t('BLSE is not installed via Vortex'), t('Get BLSE'), action);
};

export const forceInstallBLSE = async (api: types.IExtensionApi) => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.sendNotification?.({
    id: 'blse-required',
    type: 'info',
    title: t('BLSE Required'),
    message: t('BLSE is required by the collection. Ensuring it is installed...'),
  });

  const profile = selectors.activeProfile(api.getState());

  const blseMod = findBLSEMod(api);
  if (blseMod) {
    // Found but not enabled
    const blseIsActive = isModActive(profile, blseMod);
    if (!blseIsActive) {
      api.store?.dispatch(actions.setModEnabled(profile.id, blseMod.id, true));
      await deployBLSE(api);
    }
  }

  const blseDownload = findBLSEDownload(api);
  if (blseDownload) {
    await deployBLSE(api);
  }

  downloadBLSE(api);
};

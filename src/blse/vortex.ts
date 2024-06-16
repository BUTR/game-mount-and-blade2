import { actions, selectors, types } from 'vortex-api';
import { deployBLSE, downloadBLSE, findBLSEDownload, findBLSEMod, isModActive } from './utils';
import { LocalizationManager } from '../localization';

const sendNotification = (
  api: types.IExtensionApi,
  title: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void
): void => {
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

export const recommendBLSE = (api: types.IExtensionApi): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const state = api.getState();

  const profile: types.IProfile | undefined = selectors.activeProfile(state);

  const blseMod = findBLSEMod(state);
  if (blseMod) {
    // Found but not enabled
    const blseIsActive = isModActive(profile, blseMod);
    if (!blseIsActive) {
      const action = (dismiss: types.NotificationDismiss): void => {
        api.store?.dispatch(actions.setModEnabled(profile.id, blseMod.id, true));
        deployBLSE(api)
          .catch(() => {})
          .finally(() => dismiss());
      };
      sendNotification(api, t('BLSE is not enabled'), t('Enable'), action);
      return;
    }
  } else {
    const blseDownload = findBLSEDownload(api);
    if (blseDownload !== undefined) {
      // Downloaded but not installed
      const action = (dismiss: types.NotificationDismiss): void => {
        api.events.emit('start-install-download', blseDownload, {
          allowAutoEnable: true,
        });
        deployBLSE(api)
          .catch(() => {})
          .finally(() => dismiss());
      };
      sendNotification(api, t('BLSE is not installed'), t('Install'), action);
    } else {
      // Non existent
      const action = (dismiss: types.NotificationDismiss): void => {
        downloadBLSE(api)
          .catch(() => {})
          .finally(() => dismiss());
      };
      sendNotification(api, t('BLSE is not installed via Vortex'), t('Get BLSE'), action);
    }
  }
};

export const forceInstallBLSE = async (api: types.IExtensionApi): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.sendNotification?.({
    id: 'blse-required',
    type: 'info',
    title: t('BLSE Required'),
    message: t('BLSE is required by the collection. Ensuring it is installed...'),
  });

  const state = api.getState();

  const profile: types.IProfile | undefined = selectors.activeProfile(state);

  const blseMod = findBLSEMod(state);
  if (blseMod) {
    // Found but not enabled
    const blseIsActive = isModActive(profile, blseMod);
    if (!blseIsActive) {
      api.store?.dispatch(actions.setModEnabled(profile.id, blseMod.id, true));
      await deployBLSE(api);
    }
  } else {
    const blseDownload = findBLSEDownload(api);
    if (blseDownload !== undefined) {
      // Downloaded but not installed
      await deployBLSE(api);
    } else {
      // Non existent
      await downloadBLSE(api);
    }
  }
};

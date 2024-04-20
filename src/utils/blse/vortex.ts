import { actions, selectors, types } from 'vortex-api';
import { findBLSEMod, deployBLSE, downloadBLSE, isModActive, findBLSEDownload } from './shared';

const sendNotification = (
  api: types.IExtensionApi,
  title: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void
) => {
  api.sendNotification?.({
    id: 'blse-missing',
    type: 'warning',
    title: title,
    message: 'BLSE is recommended to mod Bannerlord.',
    actions: [
      {
        title: actionTitle,
        action: action,
      },
    ],
  });
};

export const recommendBLSE = (api: types.IExtensionApi) => {
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
      sendNotification(api, 'BLSE is not enabled', 'Enable', action);
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
    sendNotification(api, 'BLSE is not installed', 'Install', action);
    return;
  }

  // Non existent
  const action = (dismiss: types.NotificationDismiss) => {
    downloadBLSE(api).then(() => dismiss());
  };
  sendNotification(api, 'BLSE is not installed via Vortex', 'Get BLSE', action);
};

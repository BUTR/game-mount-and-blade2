import { types } from 'vortex-api';
import { findBLSEMod, deployBLSE, downloadBLSE } from './shared';

export const recommendBLSE = (api: types.IExtensionApi) => {
  const blseMod = findBLSEMod(api);
  const title = blseMod ? 'BLSE is not deployed' : 'BLSE is not installed via Vortex';
  const actionTitle = blseMod ? 'Deploy' : 'Get BLSE';
  const action = () => (blseMod
    ? deployBLSE(api)
    : downloadBLSE(api))
    .then(() => api.dismissNotification?.('blse-missing'));

  api.sendNotification?.({
    id: 'blse-missing',
    type: 'warning',
    title,
    message: 'BLSE is recommended to mod Bannerlord.',
    actions: [
      {
        title: actionTitle,
        action,
      },
    ]
  });
};
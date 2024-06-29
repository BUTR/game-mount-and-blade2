import { types } from 'vortex-api';

export const openLoadOrderPage = (api: types.IExtensionApi): void => {
  api.events.emit('show-main-page', 'file-based-loadorder');
};

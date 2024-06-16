import { actions, types } from 'vortex-api';
import { hasSettingsInterfacePrimaryTool } from '../vortex';
import { GAME_ID } from '../common';
import { findBLSEMod } from '.';

export const didDeployBLSE = (api: types.IExtensionApi): void => {
  const state = api.getState();

  if (!hasSettingsInterfacePrimaryTool(state.settings.interface)) {
    return;
  }

  const primaryTool = state.settings.interface.primaryTool.mountandblade2bannerlord;

  const blseMod = findBLSEMod(state);
  if (blseMod && primaryTool === undefined) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, 'blse-cli'));
  }
  if (!blseMod && primaryTool === 'blse-cli') {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }
};

/**
 * Event function, be careful
 */
export const didPurgeBLSE = (api: types.IExtensionApi): void => {
  const state = api.getState();

  if (!hasSettingsInterfacePrimaryTool(state.settings.interface)) {
    return;
  }

  const primaryTool = state.settings.interface.primaryTool.mountandblade2bannerlord;
  if (primaryTool !== 'blse-cli') {
    return;
  }

  const blseMod = findBLSEMod(state);
  if (blseMod) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }
};

import { actions, types } from 'vortex-api';
import { findBLSEMod } from './utils';
import { getPersistentBannerlordMods, hasSettingsInterfacePrimaryTool } from '../vortex';
import { GAME_ID } from '../common';

export const didDeployBLSE = (api: types.IExtensionApi): Promise<void> => {
  const state = api.getState();

  if (!hasSettingsInterfacePrimaryTool(state.settings.interface)) {
    return Promise.resolve();
  }

  const primaryTool = state.settings.interface.primaryTool.mountandblade2bannerlord;

  const mods = getPersistentBannerlordMods(state.persistent);
  const blseMod = findBLSEMod(mods);
  if (blseMod && primaryTool === undefined) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, 'blse-cli'));
  }
  if (!blseMod && primaryTool === 'blse-cli') {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

/**
 * Event function, be careful
 */
export const didPurgeBLSE = (api: types.IExtensionApi): Promise<void> => {
  const state = api.getState();

  if (!hasSettingsInterfacePrimaryTool(state.settings.interface)) {
    return Promise.resolve();
  }

  const primaryTool = state.settings.interface.primaryTool.mountandblade2bannerlord;
  if (primaryTool !== 'blse-cli') {
    return Promise.resolve();
  }

  const mods = getPersistentBannerlordMods(state.persistent);
  const blseMod = findBLSEMod(mods);
  if (blseMod) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

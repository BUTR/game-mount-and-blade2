import { actions, selectors, types } from 'vortex-api';
import { findBLSEMod } from './shared';
import { GAME_ID } from '../../common';
import { hasSettingsInterfacePrimaryTool } from '../vortex';
import { LoadOrderManager } from '../loadOrder';

/**
 * Event function, be careful
 */
export const didDeployEvent = async (
  api: types.IExtensionApi,
  profileId: string,
  getLOManager: () => LoadOrderManager
) => {
  try {
    await getLOManager().deserializeLoadOrder();
  } catch (err) {
    api.showErrorNotification?.('Failed to deserialize load order file', err);
  }

  return didDeployBLSE(api, profileId);
};

/**
 * Event function, be careful
 */
export const didDeployBLSE = async (api: types.IExtensionApi, profileId: string) => {
  const state = api.getState();
  const profile = selectors.profileById(state, profileId);
  if (profile.gameId !== GAME_ID) {
    return Promise.resolve();
  }

  if (!hasSettingsInterfacePrimaryTool(state.settings.interface)) {
    return Promise.resolve();
  }

  const primaryTool = state.settings.interface.primaryTool.mountandblade2bannerlord;

  const blseMod = findBLSEMod(api);
  if (!!blseMod && !primaryTool) {
    api.store?.dispatch(actions.setPrimaryTool(profile.gameId, 'blse-cli'));
  }
  if (!blseMod && primaryTool === 'blse-cli') {
    api.store?.dispatch(actions.setPrimaryTool(profile.gameId, undefined!));
  }

  return Promise.resolve();
};

/**
 * Event function, be careful
 */
export const didPurgeBLSE = async (api: types.IExtensionApi, profileId: string) => {
  const state = api.getState();
  const profile = selectors.profileById(state, profileId);
  if (profile.gameId !== GAME_ID) {
    return Promise.resolve();
  }

  if (!hasSettingsInterfacePrimaryTool(state.settings.interface)) {
    return Promise.resolve();
  }

  const primaryTool = state.settings.interface.primaryTool.mountandblade2bannerlord;
  if (primaryTool !== 'blse-cli') {
    return Promise.resolve();
  }

  const blseMod = findBLSEMod(api);
  if (blseMod) {
    api.store?.dispatch(actions.setPrimaryTool(profile.gameId, undefined!));
  }

  return Promise.resolve();
};

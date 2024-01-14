import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { actions, selectors, types, util } from 'vortex-api';
import { findBLSEMod } from './shared';
import { GAME_ID } from '../../common';

export const didDeployBLSE = async (api: types.IExtensionApi, profileId: string) => {
  const state = api.getState();
  const profile = selectors.profileById(state, profileId);
  if (profile.gameId !== GAME_ID) {
    return Promise.resolve();
  }

  const blseMod = findBLSEMod(api);
  const primaryTool = util.getSafe(state.settings.interface, ['primaryTool', GAME_ID], undefined);
  if (blseMod && !primaryTool) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, 'blse-cli'));
  }
  if (!blseMod && primaryTool === 'blse-cli') {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};

export const didPurgeBLSE = async (api: types.IExtensionApi, profileId: string) => {
  const state = api.getState();
  const profile = selectors.profileById(state, profileId);
  if (profile.gameId !== GAME_ID) {
    return Promise.resolve();
  }

  const blseMod = findBLSEMod(api);
  const primaryTool = util.getSafe(state.settings.interface, ['primaryTool', GAME_ID], undefined);
  if (blseMod && primaryTool === 'blse-cli') {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, undefined!));
  }

  return Promise.resolve();
};
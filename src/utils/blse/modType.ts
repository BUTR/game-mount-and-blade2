import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types } from 'vortex-api';
import { BLSE_CLI_EXE } from '../../common';

export const getInstallPathBLSE = (api: types.IExtensionApi, game: types.IGame): string => {
  const state = api.getState();
  const discovery = state.settings.gameMode.discovered[game.id];
  return discovery?.path || ``;
};

export const isModTypeBLSE = toBluebird((instructions: types.IInstruction[]): boolean => {
  const blseInstruction = instructions.find(inst => (inst.type === 'copy') && inst.source && inst.source.endsWith(BLSE_CLI_EXE));

  return !!blseInstruction;
});
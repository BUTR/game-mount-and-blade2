import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types } from 'vortex-api';
import { SUBMODULE_FILE } from '../../common';

export const getInstallPathModule = (api: types.IExtensionApi, game: types.IGame): string => {
  const state = api.getState();
  const discovery = state.settings.gameMode.discovered[game.id];
  return discovery && discovery.path ? discovery.path : ``;
};

export const isModTypeModule = toBluebird((instructions: types.IInstruction[]): boolean => {
  const copyInstructions = instructions.filter(instr => instr.type === 'copy');
  const hasSubModule = !!copyInstructions.find(instr => instr.destination?.endsWith(SUBMODULE_FILE))
  return hasSubModule;
});
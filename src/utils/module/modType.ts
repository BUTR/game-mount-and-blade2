import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { selectors, types } from 'vortex-api';
import { SUBMODULE_FILE } from '../../common';

export const getInstallPathModule = (api: types.IExtensionApi, game: types.IGame): string => {
  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(api.getState(), game.id);
  return discovery?.path ?? ``;
};

export const isModTypeModule = toBluebird((instructions: types.IInstruction[]): boolean => {
  const copyInstructions = instructions.filter(instr => instr.type === 'copy');
  return !!copyInstructions.find(instr => instr.destination?.endsWith(SUBMODULE_FILE))
});
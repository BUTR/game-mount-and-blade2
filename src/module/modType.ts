import { selectors, types } from 'vortex-api';
import { SUBMODULE_FILE } from '../common';

export const getInstallPathModule = (api: types.IExtensionApi, game: types.IGame): string => {
  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(api.getState(), game.id);
  return discovery?.path ?? ``;
};

export const isModTypeModule = (instructions: types.IInstruction[]): boolean => {
  const result = instructions.some((instr) => instr.type === 'copy' && instr.destination?.endsWith(SUBMODULE_FILE));
  return result;
};

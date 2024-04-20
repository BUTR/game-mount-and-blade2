import { selectors, types } from 'vortex-api';
import { BLSE_CLI_EXE } from '../../common';

export const getInstallPathBLSE = (api: types.IExtensionApi, game: types.IGame): string => {
  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(api.getState(), game.id);
  return discovery?.path ?? ``;
};

export const isModTypeBLSE = (instructions: types.IInstruction[]): boolean => {
  const blseInstruction = instructions.find(
    (inst) => inst.type === 'copy' && inst.source && inst.source.endsWith(BLSE_CLI_EXE)
  );
  return !!blseInstruction;
};

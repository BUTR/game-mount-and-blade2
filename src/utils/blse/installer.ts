import path from 'path';
import { selectors, types } from 'vortex-api';
import { isStoreXbox } from '..';
import { GAME_ID, BLSE_CLI_EXE, BINARY_FOLDER_XBOX, BINARY_FOLDER_STANDARD } from '../../common';

export const installBLSE = async (api: types.IExtensionApi, files: string[]): Promise<types.IInstallResult> => {
  const discovery = selectors.currentGameDiscovery(api.getState());
  if (!discovery) {
    return Promise.resolve({
      instructions: [],
    });
  }

  const isXbox = isStoreXbox(discovery.store);
  const instructions = files
    .filter(
      (file: string) => !file.endsWith(path.sep) && file.includes(isXbox ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD)
    )
    .map<types.IInstruction>((file) => ({
      type: 'copy',
      source: file,
      destination: file,
    }));
  return {
    instructions: instructions,
  };
};

export const testBLSE = (files: string[], gameId: string): Promise<types.ISupportedResult> => {
  const supported = gameId === GAME_ID && !!files.find((file) => path.basename(file) === BLSE_CLI_EXE);
  return Promise.resolve({
    supported,
    requiredFiles: [],
  });
};

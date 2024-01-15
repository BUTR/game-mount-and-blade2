import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { types } from 'vortex-api';
import { isStoreXbox, getBannerlordDiscovery } from '..';
import { GAME_ID, BLSE_CLI_EXE, BINARY_FOLDER_XBOX, BINARY_FOLDER_STANDARD } from '../../common';

export const installBLSE = toBluebird(async (api: types.IExtensionApi, files: string[], destinationPath: string): Promise<types.IInstallResult> => {
  const discovery = getBannerlordDiscovery(api);
  if (!discovery) {
    return Promise.resolve({
      instructions: []
    });
  }

  const isXbox = isStoreXbox(discovery.store);
  const instructions = files.filter(file => file.includes(isXbox ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD)).map<types.IInstruction>(file => ({
    type: 'copy',
    source: file,
    // TODO: Investigation
    destination: path.join(`bin`, isXbox ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD)
  }));
  return {
    instructions: instructions
  };
});

export const testBLSE = (files: string[], gameId: string, archivePath?: string): Bluebird<types.ISupportedResult> => {
  const supported = gameId === GAME_ID && !!files.find(file => (path.basename(file) === BLSE_CLI_EXE));
  return Bluebird.resolve({
    supported,
    requiredFiles: [],
  });
};
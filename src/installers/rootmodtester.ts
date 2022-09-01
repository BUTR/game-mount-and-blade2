/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { types } from 'vortex-api';
import { GAME_ID, MODULES, ROOT_FOLDERS } from '../common';

export const testRootMod = toBluebird(async (files: string[], gameId: string): Promise<types.ISupportedResult> => {
  const notSupported = { supported: false, requiredFiles: [] };

  if (gameId !== GAME_ID) {
    // Different game.
    return notSupported;
  }

  const lowered = files.map((file) => file.toLowerCase());
  const modsFile = lowered.find((file) => file.split(path.sep).indexOf(MODULES.toLowerCase()) !== -1);
  if (modsFile === undefined) {
    // There's no Modules folder.
    return notSupported;
  }

  const idx = modsFile.split(path.sep).indexOf(MODULES.toLowerCase());
  const rootFolderMatches = lowered.filter((file) => {
    const segments = file.split(path.sep);
    return (((segments.length - 1) > idx) && ROOT_FOLDERS.has(segments[idx]));
  }) || [];

  return { supported: (rootFolderMatches.length > 0), requiredFiles: [] };
});

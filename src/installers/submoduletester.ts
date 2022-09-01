/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { ISupportedResult } from 'vortex-api/lib/types/api';
import { GAME_ID, SUBMOD_FILE } from '../common';

export const testForSubmodules = toBluebird<ISupportedResult, string[], string>(async (files: string[], gameId: string): Promise<ISupportedResult> => {
  const notSupported = { supported: false, requiredFiles: [] };

  if (gameId !== GAME_ID) {
    // Different game.
    return notSupported;
  }

  if (files.find((file) => path.basename(file).toLowerCase() === SUBMOD_FILE) === undefined) {
    // Doesn't contain a SubModule.xml
    return notSupported;
  }

  return { supported: true, requiredFiles: [] };
});

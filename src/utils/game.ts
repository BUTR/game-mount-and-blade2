import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { fs, types } from 'vortex-api';
import { findBLSEMod } from '.';
import { XBOX_ID, BANNERLORD_EXEC, BANNERLORD_EXEC_XBOX, GAME_ID, BLSE_EXE } from '../common';

const xboxStore = (blseMod: types.IMod | undefined): string => {
  if (!blseMod) {
    // TODO: report that BLSE is needed
  }
  return BLSE_EXE;
}
const steamGogEpicStore = (blseMod: types.IMod | undefined): string => {
  const exec = blseMod ? BLSE_EXE : BANNERLORD_EXEC;
  return exec;
}

export const getBannerlordExec = (discoveryPath: string|undefined, api: types.IExtensionApi): string => {
  const discovery: types.IDiscoveryResult = (api.getState().persistent.gameMode as any).discovered?.[GAME_ID];
  if (!discovery) return BANNERLORD_EXEC;

  const blseMod = findBLSEMod(api);

  if (discovery.store === `xbox`) {
    return xboxStore(blseMod);
  }

  if (!!discovery.store && [`gog`, `steam`, `epic`].includes(discovery.store)) {
    return steamGogEpicStore(blseMod);
  }

  if (!discovery.store && !!discoveryPath) {
    // Brute force the detection by manually checking the paths.
    try {
    fs.statSync(path.join(discoveryPath, BANNERLORD_EXEC_XBOX));
      return xboxStore(blseMod);
    } catch (err) {
      return steamGogEpicStore(blseMod);
    }
  }

  return steamGogEpicStore(blseMod);
};

export const requiresLauncher = async (store?: string): Promise<{ launcher: string, addInfo?: any }> => {
  if (store === `xbox`) {
    return {
      launcher: `xbox`,
      addInfo: {
        appId: XBOX_ID,
        parameters: [{ appExecName: `bin.Gaming.Desktop.x64.Shipping.Client.Launcher.Native` }],
      },
    };
  }
  // The API doesn't expect undefined, but it's allowed
  return undefined!;
};

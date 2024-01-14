import { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { types, util } from 'vortex-api';
import { VortexLauncherManager, addBLSETools, addModdingKitTool, addOfficialCLITool, addOfficialLauncherTool, getBinaryPath, getPathExistsAsync, isStoreSteam, isStoreXbox, recommendBLSE } from '.';
import { BLSE_CLI_EXE, XBOX_ID } from '../common';

const prepareForModding = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);
 
  // skip if BLSE found
  // question: if the user incorrectly deleted BLSE and the binary is left, what should we do?
  // maybe just ask the user to always install BLSE via Vortex?
  if (!await getPathExistsAsync(path.join(discovery.path, getBinaryPath(discovery.store), BLSE_CLI_EXE))) {
    recommendBLSE(api);
  }

  if (isStoreSteam(discovery.store)) {
    await util.GameStoreHelper.launchGameStore(api, discovery.store!, undefined, true).catch(() => { });
  }

  if (discovery.store) {
    manager.setStore(discovery.store);
  }
};

export const setup = toBluebird(async (api: types.IExtensionApi, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  // Quickly ensure that the official Launcher is added.
  addOfficialCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  await addBLSETools(api, discovery);

  await prepareForModding(api, discovery, manager);
});

export const requiresLauncher = async (store?: string): Promise<{ launcher: string, addInfo?: any }> => {
  if (isStoreXbox(store)) {
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
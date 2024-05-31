import path from 'path';
import { types, util } from 'vortex-api';
import {
  VortexLauncherManager,
  addBLSETools,
  addModdingKitTool,
  addOfficialCLITool,
  addOfficialLauncherTool,
  getBinaryPath,
  getPathExistsAsync,
  isStoreSteam,
  isStoreXbox,
  nameof,
  recommendBLSE,
} from '.';
import { BLSE_CLI_EXE, GAME_ID, XBOX_ID } from '../common';
import {
  ISettingsWithBannerlord,
  ISettingsInterfaceWithPrimaryTool,
  IStatePersistent,
  IStatePersistentWithLoadOrder,
} from '../types';

type HasSettings = {
  settings: types.ISettings;
};

type RequiresLauncherResult = {
  launcher: string;
  addInfo?: unknown;
};

export const hasPersistentLoadOrder = (persistent: IStatePersistent): persistent is IStatePersistentWithLoadOrder => {
  return typeof (persistent as never)[nameof<IStatePersistentWithLoadOrder>('loadOrder')] === 'object';
};

export const hasSettings = (hasSettings: unknown): hasSettings is HasSettings => {
  return typeof (hasSettings as never)[nameof<HasSettings>('settings')] === 'object';
};

export const hasSettingsBannerlord = (settings: types.ISettings): settings is ISettingsWithBannerlord => {
  return typeof (settings as never)[GAME_ID] === 'object';
};

export const hasSettingsInterfacePrimaryTool = (
  settings: types.ISettingsInterface
): settings is ISettingsInterfaceWithPrimaryTool => {
  return typeof (settings as never)[nameof<ISettingsInterfaceWithPrimaryTool>('primaryTool')] === 'object';
};

const launchGameStore = async (api: types.IExtensionApi, store: string): Promise<void> => {
  await util.GameStoreHelper.launchGameStore(api, store, undefined, true).catch(() => {
    /* ignore error */
  });
};

const prepareForModding = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  manager: VortexLauncherManager
): Promise<void> => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  // skip if BLSE found
  // question: if the user incorrectly deleted BLSE and the binary is left, what should we do?
  // maybe just ask the user to always install BLSE via Vortex?
  const binaryPath = path.join(discovery.path, getBinaryPath(discovery.store), BLSE_CLI_EXE);
  if (!(await getPathExistsAsync(binaryPath))) {
    recommendBLSE(api);
  }

  if (isStoreSteam(discovery.store)) {
    await launchGameStore(api, discovery.store);
  }

  if (discovery.store) {
    manager.setStore(discovery.store);
  }
};

export const setup = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  manager: VortexLauncherManager
): Promise<void> => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  // Quickly ensure that the official Launcher is added.
  addOfficialCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  await addBLSETools(api, discovery);

  await prepareForModding(api, discovery, manager);
};

export const requiresLauncher = async (store?: string): Promise<RequiresLauncherResult> => {
  if (isStoreXbox(store)) {
    return {
      launcher: `xbox`,
      addInfo: {
        appId: XBOX_ID,
        parameters: [
          {
            appExecName: `bin.Gaming.Desktop.x64.Shipping.Client.Launcher.Native`,
          },
        ],
      },
    };
  }
  // The API doesn't expect undefined, but it's allowed
  return undefined!;
};

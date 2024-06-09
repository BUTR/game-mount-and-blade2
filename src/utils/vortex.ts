import path from 'path';
import { types, util } from 'vortex-api';
import {
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
  IStatePersistentWithLoadOrder,
  GetLocalizationManager,
  GetLauncherManager,
} from '../types';

type HasSettings = {
  settings: types.ISettings;
};

type RequiresLauncherResult = {
  launcher: string;
  addInfo?: unknown;
};

export const hasPersistentLoadOrder = (persistent: object): persistent is IStatePersistentWithLoadOrder => {
  return nameof<IStatePersistentWithLoadOrder>('loadOrder') in persistent;
};

export const hasSettings = (hasSettings: object): hasSettings is HasSettings => {
  return nameof<HasSettings>('settings') in hasSettings;
};

export const hasSettingsBannerlord = (settings: object): settings is ISettingsWithBannerlord => {
  return GAME_ID in settings;
};

export const hasSettingsInterfacePrimaryTool = (settings: object): settings is ISettingsInterfaceWithPrimaryTool => {
  return nameof<ISettingsInterfaceWithPrimaryTool>('primaryTool') in settings;
};

const launchGameStore = async (api: types.IExtensionApi, store: string): Promise<void> => {
  await util.GameStoreHelper.launchGameStore(api, store, undefined, true).catch(() => {
    /* ignore error */
  });
};

const prepareForModding = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  getLauncherManager: GetLauncherManager,
  getLocalizationManager: GetLocalizationManager
): Promise<void> => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  // skip if BLSE found
  // question: if the user incorrectly deleted BLSE and the binary is left, what should we do?
  // maybe just ask the user to always install BLSE via Vortex?
  const binaryPath = path.join(discovery.path, getBinaryPath(discovery.store), BLSE_CLI_EXE);
  if (!(await getPathExistsAsync(binaryPath))) {
    recommendBLSE(api, getLocalizationManager);
  }

  if (isStoreSteam(discovery.store)) {
    await launchGameStore(api, discovery.store);
  }

  if (discovery.store) {
    const launcherManager = getLauncherManager();
    launcherManager.setStore(discovery.store);
  }
};

export const setup = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  getLauncherManager: GetLauncherManager,
  getLocalizationManager: GetLocalizationManager
): Promise<void> => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  // Quickly ensure that the official Launcher is added.
  addOfficialCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  await addBLSETools(api, discovery);

  await prepareForModding(api, discovery, getLauncherManager, getLocalizationManager);
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

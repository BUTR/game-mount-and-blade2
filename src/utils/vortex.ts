import { types, util } from 'vortex-api';
import path from 'path';
import { nameof } from './nameof';
import { getBinaryPath } from './game';
import { getPathExistsAsync } from './util';
import { recommendBLSE } from './blse';
import { isStoreSteam, isStoreXbox } from './store';
import { addBLSETools, addModdingKitTool, addOfficialCLITool, addOfficialLauncherTool } from './tools';
import { VortexLauncherManager } from './launcher';
import { BLSE_CLI_EXE, GAME_ID, XBOX_ID } from '../common';
import {
  ISettingsInterfaceWithPrimaryTool,
  ISettingsWithBannerlord,
  IStatePersistent,
  IStatePersistentWithBannerlordMods,
  IStatePersistentWithLoadOrder,
} from '../types';

type HasSettings = {
  settings: types.ISettings;
};

type RequiresLauncherResult = {
  launcher: string;
  addInfo?: unknown;
};

export const hasPersistentLoadOrder = (
  statePersistent: IStatePersistent
): statePersistent is IStatePersistentWithLoadOrder =>
  nameof<IStatePersistentWithLoadOrder>('loadOrder') in statePersistent;

export const hasPersistentBannerlordMods = (
  statePersistent: IStatePersistent
): statePersistent is IStatePersistentWithBannerlordMods =>
  nameof<IStatePersistentWithBannerlordMods>('mods') in statePersistent && GAME_ID in statePersistent.mods;

export const hasSettings = (hasSettings: object): hasSettings is HasSettings =>
  nameof<HasSettings>('settings') in hasSettings;

export const hasSettingsBannerlord = (settings: types.ISettings): settings is ISettingsWithBannerlord =>
  GAME_ID in settings;

export const hasSettingsInterfacePrimaryTool = (
  settings: types.ISettingsInterface
): settings is ISettingsInterfaceWithPrimaryTool =>
  nameof<ISettingsInterfaceWithPrimaryTool>('primaryTool') in settings;

const launchGameStore = async (api: types.IExtensionApi, store: string): Promise<void> => {
  await util.GameStoreHelper.launchGameStore(api, store, undefined, true).catch(() => {
    /* ignore error */
  });
};

const prepareForModding = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  if (discovery.path === undefined) {
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

  if (discovery.store !== undefined) {
    const launcherManager = VortexLauncherManager.getInstance(api);

    launcherManager.setStore(discovery.store);
  }
};

export const setup = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  // Quickly ensure that the official Launcher is added.
  addOfficialCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  addBLSETools(api, discovery);

  await prepareForModding(api, discovery);
};

export const requiresLauncher = (store?: string): RequiresLauncherResult => {
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

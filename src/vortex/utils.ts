import { types, util } from 'vortex-api';
import {
  ISettingsInterfaceWithPrimaryTool,
  IStatePersistentWithBannerlordMods,
  IStatePersistentWithLoadOrder,
  IStateSessionWithBannerlord,
} from './types';
import { isStoreSteam, isStoreXbox } from './store';
import { addBLSETools, addModdingKitTool, addOfficialCLITool, addOfficialLauncherTool } from './tools';
import { nameof } from '../nameof';
import { recommendBLSEAsync } from '../blse';
import { VortexLauncherManager } from '../launcher';
import { EPICAPP_ID, GAME_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from '../common';
import { IBannerlordModStorage, IStatePersistent, IStateSession, VortexLoadOrderStorage } from '../types';
import { LocalizationManager } from '../localization';

type HasSession = {
  session: types.ISession;
};

type HasSettings = {
  settings: types.ISettings;
};

type RequiresLauncherResult = {
  launcher: string;
  addInfo?: unknown;
};

export const getPersistentLoadOrder = (
  statePersistent: IStatePersistent,
  profileId: string | undefined
): VortexLoadOrderStorage => {
  if (!hasPersistentLoadOrder(statePersistent) || profileId === undefined) {
    return [];
  }
  return statePersistent.loadOrder[profileId] ?? [];
};

export const getPersistentBannerlordMods = (statePersistent: IStatePersistent): IBannerlordModStorage => {
  if (!hasPersistentBannerlordMods(statePersistent)) {
    return {};
  }
  return statePersistent.mods[GAME_ID];
};

export const hasPersistentLoadOrder = (
  statePersistent: IStatePersistent
): statePersistent is IStatePersistentWithLoadOrder =>
  nameof<IStatePersistentWithLoadOrder>('loadOrder') in statePersistent;

export const hasPersistentBannerlordMods = (
  statePersistent: IStatePersistent
): statePersistent is IStatePersistentWithBannerlordMods =>
  nameof<IStatePersistentWithBannerlordMods>('mods') in statePersistent && GAME_ID in statePersistent.mods;

export const hasSession = (hasSession: object): hasSession is HasSession => nameof<HasSession>('session') in hasSession;

export const hasSessionWithBannerlord = (stateSession: IStateSession): stateSession is IStateSessionWithBannerlord =>
  nameof<IStateSessionWithBannerlord>(GAME_ID) in stateSession;

export const hasSettings = (hasSettings: object): hasSettings is HasSettings =>
  nameof<HasSettings>('settings') in hasSettings;

export const hasSettingsInterfacePrimaryTool = (
  settings: types.ISettingsInterface
): settings is ISettingsInterfaceWithPrimaryTool =>
  nameof<ISettingsInterfaceWithPrimaryTool>('primaryTool') in settings;

const launchGameStoreAsync = async (api: types.IExtensionApi, store: string): Promise<void> => {
  await util.GameStoreHelper.launchGameStore(api, store, undefined, true).catch((err) => {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t('Failed to launch the game store'), err);
  });
};

const prepareForModdingAsync = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  await recommendBLSEAsync(api, discovery);

  if (isStoreSteam(discovery.store)) {
    await launchGameStoreAsync(api, discovery.store);
  }

  if (discovery.store !== undefined) {
    const launcherManager = VortexLauncherManager.getInstance(api);

    launcherManager.setStore(discovery.store);
  }
};

export const setupAsync = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  // Quickly ensure that the official Launcher is added.
  addOfficialCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  addBLSETools(api, discovery);

  await prepareForModdingAsync(api, discovery);
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

export const findGameAsync = async (): Promise<types.IGameStoreEntry> => {
  return await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]);
};

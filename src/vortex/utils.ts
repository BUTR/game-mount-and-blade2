import { types, util } from 'vortex-api';
import {
  ISettingsInterfaceWithPrimaryTool,
  IStatePersistentWithBannerlord,
  IStatePersistentWithBannerlordMods,
  IStatePersistentWithLoadOrder,
  IStateSessionWithBannerlord,
} from './types';
import { isStoreSteam, isStoreXbox } from './store';
import { addBLSETools, addModdingKitTool, addOfficialCLITool, addOfficialLauncherTool } from './tools';
import { nameof } from '../nameof';
import { recommendBLSE } from '../blse';
import { VortexLauncherManager } from '../launcher';
import { EPICAPP_ID, GAME_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from '../common';
import { IStatePersistent, IStateSession } from '../types';

type HasPersistent = Pick<types.IState, 'persistent'>;
type HasSession = Pick<types.IState, 'session'>;
type HasSettings = Pick<types.IState, 'settings'>;

type RequiresLauncherResult = {
  launcher: string;
  addInfo?: unknown;
};

export const hasPersistent = (hasPersistent: object): hasPersistent is HasPersistent =>
  nameof<HasPersistent>('persistent') in hasPersistent;

export const hasPersistentBannerlord = (
  statePersistent: IStatePersistent
): statePersistent is IStatePersistentWithBannerlord =>
  nameof<IStatePersistentWithBannerlord>(GAME_ID) in statePersistent;

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

const launchGameStore = async (api: types.IExtensionApi, store: string): Promise<void> => {
  await util.GameStoreHelper.launchGameStore(api, store, undefined, true).catch(() => {
    /* ignore error */
  });
};

const prepareForModding = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  await recommendBLSE(api, discovery);

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

export const findGame = async (): Promise<types.IGameStoreEntry> => {
  return await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]);
};

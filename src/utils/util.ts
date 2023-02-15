import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types, util } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID } from '../common';
import { VortexLauncherManager } from './VortexLauncherManager';

let STORE_ID: string;

const toChar = (avt: vetypes.ApplicationVersionType): string => {
  switch (avt) {
    case vetypes.ApplicationVersionType.Alpha: return "a";
    case vetypes.ApplicationVersionType.Beta: return "b";
    case vetypes.ApplicationVersionType.Development: return "d";
    case vetypes.ApplicationVersionType.EarlyAccess: return "e";
    case vetypes.ApplicationVersionType.Release: return "v";
    default: return avt.toString();
  }
};

export const versionToString = (av: vetypes.ApplicationVersion): string => {
  return `${toChar(av.applicationVersionType)}${av.major}.${av.minor}.${av.revision}.${av.changeSet}`
};

export const getVersion = (metadata: vetypes.DependentModuleMetadata): string => {
  if (!isVersionEmpty(metadata.version))  {
      return ` >= ${versionToString(metadata.version)}`;
  }
  if (!isVersionRangeEmpty(metadata.versionRange))  {
      return ` >= ${versionToString(metadata.versionRange.min)} <= ${versionToString(metadata.versionRange.max)}`;
  }
  return "";
};

export const isVersionEmpty = (av: vetypes.ApplicationVersion): boolean => {
  return av.applicationVersionType == vetypes.ApplicationVersionType.Alpha && av.major == 0 && av.minor == 0 && av.revision == 0 && av.changeSet == 0;
};
export const isVersionRangeEmpty = (avr: vetypes.ApplicationVersionRange): boolean => {
  return isVersionEmpty(avr.min) && isVersionEmpty(avr.max);
};

export const findGame = toBluebird<string>(async (): Promise<string> => {
  const game = await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS]);
  STORE_ID = game.gameStoreId;
  return game.gamePath;
});

export const prepareForModding = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  // If game store not found, location may be set manually - allow setup function to continue.
  const findStoreId = (): Bluebird<string | void> => findGame().catch((_err) => Promise.resolve());
  const startSteam = (): Bluebird<void> => findStoreId().then(() => ((STORE_ID === `steam`)
    ? util.GameStoreHelper.launchGameStore(context.api, STORE_ID, undefined, true)
    : Promise.resolve()));

  // Check if we've already set the load order object for this profile and create it if we haven't.
  return startSteam().finally(() => {
    manager.initializeModuleViewModels();
    manager.orderBySavedLoadOrder();
  });
};
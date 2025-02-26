import { selectors, types } from 'vortex-api';
import {
  IExtensionContextWithCollectionFeature,
  IModWithCollection,
  IModWithIncludedModOptions,
  IncludedModOptions,
  IStatePersistentWithModsWithIncludedModOptions,
} from './types';
import { GAME_ID } from '../common';
import { IStatePersistent } from '../types';
import { LocalizationManager } from '../localization';
import {
  checkBLSEDeploy,
  checkHarmonyDeploy,
  getPersistentBannerlordMods,
  installBLSE,
  installHarmony,
} from '../vortex';

export const hasContextWithCollectionFeature = (
  context: types.IExtensionContext
): context is IExtensionContextWithCollectionFeature => {
  return context.optional.registerCollectionFeature;
};

export const hasStatePersistentCollectionModWithIncludedModOptions = (
  statePersistent: IStatePersistent,
  collectionId: string
): statePersistent is IStatePersistentWithModsWithIncludedModOptions => {
  if (!statePersistent.mods[GAME_ID]) {
    return false;
  }

  if (!statePersistent.mods[GAME_ID][collectionId]) {
    return false;
  }

  return hasIncludedModOptions(statePersistent.mods[GAME_ID][collectionId]!);
};

export const hasModAttributeCollection = <T = unknown>(mod: types.IMod): mod is IModWithCollection<T> => {
  const modWithIncludedModOptions = mod as IModWithCollection<T>;
  if (!modWithIncludedModOptions.attributes) {
    return false;
  }

  if (modWithIncludedModOptions.attributes.collection === undefined) {
    return false;
  }

  return true;
};

export const hasIncludedModOptions = (mod: types.IMod): mod is IModWithIncludedModOptions => {
  if (!hasModAttributeCollection<IncludedModOptions>(mod)) {
    return false;
  }

  if (!mod.attributes) {
    return false;
  }

  if (!mod.attributes.collection) {
    return false;
  }

  if (!mod.attributes.collection.includedModOptions) {
    return false;
  }

  return true;
};

export const collectionInstallBLSE = async (api: types.IExtensionApi): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.sendNotification?.({
    id: 'blse-required',
    type: 'info',
    title: t('BLSE Required'),
    message: t(`BLSE is required by the collection. Ensuring it is installed and it's dependencies...`),
  });

  const state = api.getState();
  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  const mods = getPersistentBannerlordMods(state.persistent);

  const harmonyDeployResult = checkHarmonyDeploy(api, profile, mods);
  const blseDeployResult = checkBLSEDeploy(api, profile, mods);

  await installHarmony(api, profile, harmonyDeployResult);
  await installBLSE(api, profile, blseDeployResult);
};

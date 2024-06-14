import { types } from 'vortex-api';
import { IStatePersistent } from '../../types';
import { GAME_ID } from '../../common';
import {
  IExtensionContextWithCollectionFeature as IExtensionContextWithCollection,
  IModWithCollection,
  IModWithIncludedModOptions,
  IncludedModOptions,
  IStatePersistentWithModsWithIncludedModOptions as IStatePersistentWithCollectionMod,
} from '.';

export const hasContextWithCollectionFeature = (
  context: types.IExtensionContext
): context is IExtensionContextWithCollection => {
  return context.optional.registerCollectionFeature;
};

export const hasStatePersistentCollectionModWithIncludedModOptions = (
  statePersistent: IStatePersistent,
  collectionId: string
): statePersistent is IStatePersistentWithCollectionMod => {
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

  if (!modWithIncludedModOptions.attributes.collection) {
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

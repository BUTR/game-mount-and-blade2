import { actions, types, util } from 'vortex-api';
import {
  ICollectionData,
  ICollectionDataWithSettingsData,
  ICollectionSettingsData,
  IModAttributesWithCollection,
  IncludedModOptions,
} from './types';
import { hasIncludedModOptions, hasModAttributeCollection } from './utils';
import { actionsCollections } from './actions';
import { nameof } from '../nameof';
import { getGlobalSettings, getSpecialSettings, overrideModOptions } from '../modoptions';
import { LocalizationManager } from '../localization';

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const genCollectionModOptionsData = (
  api: types.IExtensionApi,
  collectionMod: types.IMod
): Promise<ICollectionSettingsData> => {
  if (!hasIncludedModOptions(collectionMod)) {
    return Promise.resolve({
      includedModOptions: [],
    });
  }

  const includedModOptions = collectionMod.attributes?.collection?.includedModOptions ?? [];

  return Promise.resolve({
    includedModOptions: includedModOptions,
  });
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const cloneCollectionModOptionsData = async (
  api: types.IExtensionApi,
  gameId: string,
  collection: ICollectionData,
  from: types.IMod,
  to: types.IMod
): Promise<void> => {
  if (!hasModOptionsData(collection)) {
    return;
  }

  if (!hasModAttributeCollection(to) || to.attributes?.collection === undefined || to.attributes.collection === null) {
    return;
  }

  const includedModOptions = collection.includedModOptions;

  const availableModOptions = Object.values({ ...getSpecialSettings(), ...(await getGlobalSettings()) });
  const availableIncludedModOptions = includedModOptions.filter((modOption) => {
    return availableModOptions.some((iter) => iter.name === modOption.name);
  });

  const attributes = util.setSafe(
    to.attributes.collection,
    [nameof<IncludedModOptions>('includedModOptions')],
    availableIncludedModOptions
  );
  api.store?.dispatch(
    actions.setModAttribute(gameId, to.id, nameof<IModAttributesWithCollection>('collection'), attributes)
  );
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const parseCollectionModOptionsData = async (
  api: types.IExtensionApi,
  collection: ICollectionData,
  mod: types.IMod
): Promise<void> => {
  if (!hasModOptionsData(collection)) {
    return;
  }

  const includedModOptions = collection.includedModOptions;

  api.store?.dispatch(
    actionsCollections.setCollectionModOptions(mod.attributes?.['collectionSlug'], {
      includedModOptions: includedModOptions,
    })
  );

  await Promise.resolve();
};

const hasModOptionsData = (collection: ICollectionData): collection is ICollectionDataWithSettingsData => {
  const collectionData = collection as ICollectionDataWithSettingsData;
  if (collectionData.includedModOptions === undefined) {
    return false;
  }
  return true;
};

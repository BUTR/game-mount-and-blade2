import { actions, types, util } from 'vortex-api';
import { nameof } from '../nameof';
import { getGlobalSettings, getSpecialSettings, writeSettingsContent } from '../modoptions';
import {
  hasIncludedModOptions,
  hasModAttributeCollection,
  ICollectionData,
  ICollectionDataWithSettingsData,
  ICollectionSettingsData,
  IncludedModOptions,
  ModAttributesWithCollection,
} from '.';

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const genCollectionModOptionsData = (api: types.IExtensionApi, collectionMod: types.IMod) => {
  if (!hasIncludedModOptions(collectionMod)) {
    const emptyData: ICollectionSettingsData = {
      includedModOptions: [],
    };
    return emptyData;
  }

  const includedModOptions = collectionMod.attributes?.collection?.includedModOptions ?? [];

  const collectionData: ICollectionSettingsData = {
    includedModOptions: includedModOptions,
  };
  return collectionData;
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const cloneCollectionModOptionsData = async (
  api: types.IExtensionApi,
  gameId: string,
  collection: ICollectionDataWithSettingsData,
  from: types.IMod,
  to: types.IMod
) => {
  if (!hasModAttributeCollection(to) || !to.attributes?.collection) {
    return;
  }

  const includedModOptions = collection.includedModOptions;

  const availableModOptions = Object.values({ ...(await getSpecialSettings()), ...(await getGlobalSettings()) });
  const availableIncludedModOptions = includedModOptions.filter((modOption) => {
    return availableModOptions.some((iter) => iter.name === modOption.name);
  });

  const attributes = util.setSafe(
    to.attributes.collection,
    [nameof<IncludedModOptions>('includedModOptions')],
    availableIncludedModOptions
  );
  api.store?.dispatch(
    actions.setModAttribute(gameId, to.id, nameof<ModAttributesWithCollection>('collection'), attributes)
  );

  const collectionData: ICollectionSettingsData = {
    includedModOptions: availableIncludedModOptions,
  };
  return collectionData;
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const parseCollectionModOptionsData = async (
  api: types.IExtensionApi,
  collection: ICollectionDataWithSettingsData
) => {
  const includedModOptions = collection.includedModOptions;
  for (const modOption of includedModOptions) {
    writeSettingsContent(modOption);
  }
};

export const hasModOptionsData = (collection: ICollectionData): collection is ICollectionDataWithSettingsData => {
  const collectionData = collection as ICollectionDataWithSettingsData;
  if (!collectionData.includedModOptions) {
    return false;
  }
  return true;
};

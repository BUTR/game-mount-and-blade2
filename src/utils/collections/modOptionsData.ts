import { actions, types, util } from 'vortex-api';
import { nameof } from '../nameof';
import { getGlobalSettings, getSpecialSettings, overrideModOptions } from '../modoptions';
import { LocalizationManager } from '../localization';
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
export const genCollectionModOptionsData = (
  api: types.IExtensionApi,
  collectionMod: types.IMod
): ICollectionSettingsData => {
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
): Promise<void> => {
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
    actions.setModAttribute(gameId, to.id, nameof<ModAttributesWithCollection>('collection'), attributes)
  );
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const parseCollectionModOptionsData = async (
  api: types.IExtensionApi,
  collection: ICollectionDataWithSettingsData,
  mod: types.IMod
): Promise<void> => {
  const includedModOptions = collection.includedModOptions;

  if (includedModOptions === undefined || !includedModOptions.length) {
    return;
  }

  const localizationManager = LocalizationManager.getInstance(api);
  const { localize: t } = localizationManager;

  const no = t('No');
  const yes = t('Yes');
  const result = await api.showDialog?.(
    'question',
    t('Override Mod Options'),
    {
      message: t(
        `This collection contains custom Mod Options (MCM)!
        Do you want to override your Mod Options with the custom Mod Options?
        A backup of your original Mod Options will be kept and will be restored on collection removal.`
      ),
    },
    [{ label: no }, { label: yes }]
  );

  if (!result || result.action === no) {
    return;
  }

  await overrideModOptions(mod, includedModOptions);
};

export const hasModOptionsData = (collection: ICollectionData): collection is ICollectionDataWithSettingsData => {
  const collectionData = collection as ICollectionDataWithSettingsData;
  if (collectionData.includedModOptions === undefined) {
    return false;
  }
  return true;
};

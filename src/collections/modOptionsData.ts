import { actions, types, util } from "vortex-api";
import {
  ICollectionData,
  ICollectionDataWithSettingsData,
  ICollectionSettingsData,
  IModAttributesWithCollection,
  IncludedModOptions,
} from "./types";
import { hasIncludedModOptions, hasModAttributeCollection } from "./utils";
import { nameof } from "../nameof";
import {
  getGlobalSettingsAsync,
  getSpecialSettings,
  overrideModOptionsAsync,
} from "../modoptions";
import { LocalizationManager } from "../localization";

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const genCollectionModOptionsDataAsync = (
  api: types.IExtensionApi,
  collectionMod: types.IMod,
): Promise<ICollectionSettingsData> => {
  if (!hasIncludedModOptions(collectionMod)) {
    return Promise.resolve({
      includedModOptions: [],
    });
  }

  const includedModOptions =
    collectionMod.attributes?.collection?.includedModOptions ?? [];

  return Promise.resolve({
    includedModOptions: includedModOptions,
  });
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const cloneCollectionModOptionsDataAsync = async (
  api: types.IExtensionApi,
  gameId: string,
  collection: ICollectionData,
  from: types.IMod,
  to: types.IMod,
): Promise<void> => {
  if (!hasModOptionsData(collection)) {
    return;
  }

  if (
    !hasModAttributeCollection(to) ||
    to.attributes?.collection === undefined ||
    to.attributes.collection === null
  ) {
    return;
  }

  const includedModOptions = collection.includedModOptions;

  const availableModOptions = Object.values({
    ...getSpecialSettings(),
    ...(await getGlobalSettingsAsync()),
  });
  const availableIncludedModOptions = includedModOptions.filter((modOption) => {
    return availableModOptions.some((iter) => iter.name === modOption.name);
  });

  const attributes = util.setSafe(
    to.attributes.collection,
    [nameof<IncludedModOptions>("includedModOptions")],
    availableIncludedModOptions,
  );
  api.store?.dispatch(
    actions.setModAttribute(
      gameId,
      to.id,
      nameof<IModAttributesWithCollection>("collection"),
      attributes,
    ),
  );
};

/**
 * Assumes that the correct Game ID is active and that the profile is set up correctly.
 */
export const parseCollectionModOptionsDataAsync = async (
  api: types.IExtensionApi,
  collection: ICollectionData,
  mod: types.IMod,
): Promise<void> => {
  if (!hasModOptionsData(collection)) {
    return;
  }

  const includedModOptions = collection.includedModOptions;

  if (includedModOptions === undefined || !includedModOptions.length) {
    return;
  }

  const localizationManager = LocalizationManager.getInstance(api);
  const { localize: t } = localizationManager;

  const no = t("No");
  const yes = t("Yes");
  const result = await api.showDialog?.(
    "question",
    t("Override Mod Options"),
    {
      message: t(
        `This collection contains custom Mod Options (MCM)!
Do you want to override your Mod Options with the custom Mod Options?
A backup of your original Mod Options will be kept and will be restored on collection removal.`,
      ),
    },
    [{ label: no }, { label: yes }],
  );

  if (!result || result.action === no) {
    return;
  }

  await overrideModOptionsAsync(mod, includedModOptions);
};

const hasModOptionsData = (
  collection: ICollectionData,
): collection is ICollectionDataWithSettingsData => {
  const collectionData = collection as ICollectionDataWithSettingsData;
  if (collectionData.includedModOptions === undefined) {
    return false;
  }
  return true;
};

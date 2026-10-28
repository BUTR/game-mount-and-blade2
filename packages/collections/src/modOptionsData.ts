import { actions, types } from "@nexusmods/vortex-api";
import {
  ICollectionData,
  ICollectionDataWithSettingsData,
  ICollectionSettingsData,
} from "./types";
import { hasCollectionWithModOptions, hasIncludedModOptions } from "./utils";
import {
  getGlobalSettingsAsync,
  getSpecialSettings,
  overrideModOptionsAsync,
} from "./modOptions/utils";
import { LocalizationManager } from "@bannerlord/core/localization/manager";

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

  if (!hasCollectionWithModOptions(to)) {
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

  to.attributes["collection"].includedModOptions = availableIncludedModOptions;

  api.store?.dispatch(
    actions.setModAttribute(
      gameId,
      to.id,
      "collection",
      to.attributes["collection"],
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
        `This collection contains custom Mod Options (MCM).
Would you like to apply them over your current Mod Options?
A backup of your original Mod Options will be kept and can be restored when the collection is removed.`,
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

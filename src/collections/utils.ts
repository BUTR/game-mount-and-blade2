import { selectors, types } from "vortex-api";
import {
  IExtensionContextWithCollectionFeature,
  IncludedModOptions,
  IModWithCollection,
  IModWithIncludedModOptions,
} from "./types";
import { LocalizationManager } from "../localization";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";
import {
  checkBLSEDeploy,
  checkHarmonyDeploy,
  resolveBLSEDeployAsync,
  resolveHarmonyDeployAsync,
} from "../blse";

export const hasContextWithCollectionFeature = (
  context: types.IExtensionContext,
): context is IExtensionContextWithCollectionFeature => {
  return context.optional.registerCollectionFeature !== undefined;
};

export const hasCollectionWithModOptions = (
  mod: types.IMod,
): mod is IModWithCollection<IncludedModOptions> => {
  return mod.attributes?.["collection"] != null;
};

export const hasIncludedModOptions = (
  mod: types.IMod,
): mod is IModWithIncludedModOptions => {
  return (
    hasCollectionWithModOptions(mod) &&
    mod.attributes["collection"].includedModOptions !== undefined
  );
};

export const collectionInstallBLSEAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.sendNotification?.({
    id: "blse-required",
    type: "info",
    title: t("BLSE Required"),
    message: t(
      `BLSE is required by the collection. Ensuring it is installed and it's dependencies...`,
    ),
  });

  const state = api.getState<IStateWithBannerlord>();

  const profile = selectors.activeProfile(state);
  if (!profile) {
    api.sendNotification?.({
      id: "blse-required-no-profile",
      type: "error",
      title: t("BLSE Required"),
      message: t(`No active profile found. Cannot install BLSE.`),
    });
    return;
  }

  const mods = bselectors.bannerlordMods(state);

  const harmonyDeployResult = checkHarmonyDeploy(api, profile, mods);
  await resolveHarmonyDeployAsync(api, profile, harmonyDeployResult);

  const blseDeployResult = checkBLSEDeploy(api, profile, mods);
  await resolveBLSEDeployAsync(api, profile, blseDeployResult);
};

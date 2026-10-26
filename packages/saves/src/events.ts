import { types } from "@nexusmods/vortex-api";
import { reloadSaveAsync } from "./utils";
import { LocalizationManager } from "@bannerlord/core/localization/manager";

/**
 * Event function, be careful
 */
export const gamemodeActivatedSaveAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  try {
    await reloadSaveAsync(api);
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to reload the save"), err);
  }
};

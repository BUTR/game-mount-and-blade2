import { types } from "vortex-api";
import { LoadOrderManager } from "./manager";
import { LocalizationManager } from "../localization";

/**
 * Event function, be careful
 */
export const didDeployLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  try {
    const loadOrderManager = LoadOrderManager.getInstance(api);
    await loadOrderManager.deserializeLoadOrder();
  } catch (err) {
    api.showErrorNotification?.(
      t("Failed to deserialize load order file"),
      err,
    );
  }
};

/**
 * Event function, be careful
 */
export const gamemodeActivatedLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  try {
    const loadOrderManager = LoadOrderManager.getInstance(api);
    await loadOrderManager.deserializeLoadOrder();
  } catch (err) {
    api.showErrorNotification?.("Failed to deserialize load order file", err);
  }
};

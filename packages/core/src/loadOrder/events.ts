import { types, util } from "@nexusmods/vortex-api";
import { LoadOrderManager } from "./manager";
import { LocalizationManager } from "../localization/manager";

const deserializeLoadOrderSafe = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  try {
    const loadOrderManager = LoadOrderManager.getInstance(api);
    await loadOrderManager.deserializeLoadOrder();
  } catch (err) {
    // A read canceled by a profile or game switch has nothing to report
    if (err instanceof util.ProcessCanceled) {
      return;
    }
    api.showErrorNotification?.(
      t("Failed to deserialize load order file"),
      err,
    );
  }
};

/**
 * Event function, be careful
 */
export const didDeployLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await deserializeLoadOrderSafe(api);
};

/**
 * Event function, be careful
 */
export const gamemodeActivatedLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await deserializeLoadOrderSafe(api);
};

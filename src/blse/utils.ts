import { actions, selectors, types, util } from "vortex-api";
import { BLSE_MOD_ID, BLSE_URL, GAME_ID, HARMONY_MOD_ID } from "../common";
import {
  downloadAndEnableLatestModVersionAsync,
  findModByPredicate,
  findModDownload,
} from "../vortex";
import { LocalizationManager } from "../localization";
import { IBannerlordMod, IBannerlordModStorage } from "../types";

const isModBLSE = (mod: IBannerlordMod): boolean => {
  return (
    mod.type === `bannerlord-blse` ||
    (mod.attributes?.modId === 1 && mod.attributes?.source === `nexus`)
  );
};

export const findBLSEMod = (
  mods: IBannerlordModStorage,
): IBannerlordMod | undefined => {
  return findModByPredicate(mods, isModBLSE);
};

export const findBLSEDownload = (
  api: types.IExtensionApi,
): string | undefined => {
  return findModDownload(api, 1);
};

export const deployBLSEAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await util.toPromise((cb) => api.events.emit("deploy-mods", cb));
  await util.toPromise((cb) =>
    api.events.emit("start-quick-discovery", () => cb(null)),
  );

  const state = api.getState();

  const discovery = selectors.currentGameDiscovery(state);
  const tool = discovery?.tools?.["blse-cli"];
  if (tool) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, tool.id));
  }
};

export const downloadBLSEAsync = async (
  api: types.IExtensionApi,
  shouldUpdate: boolean = false,
): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.dismissNotification?.("blse-missing");
  api.sendNotification?.({
    id: "blse-installing",
    message: shouldUpdate ? t("Updating BLSE") : t("Installing BLSE"),
    type: "activity",
    noDismiss: true,
    allowSuppress: false,
  });

  await api.ext?.ensureLoggedIn?.();

  try {
    await downloadAndEnableLatestModVersionAsync(api, BLSE_MOD_ID);

    await deployBLSEAsync(api);
  } catch (err) {
    api.showErrorNotification?.(t("Failed to download/install BLSE"), err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.("blse-installing");
  }
};

export const downloadHarmonyAsync = async (
  api: types.IExtensionApi,
  shouldUpdate: boolean = false,
): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.dismissNotification?.("harmony-missing");
  api.sendNotification?.({
    id: "harmony-installing",
    message: shouldUpdate ? t("Updating Harmony") : t("Installing Harmony"),
    type: "activity",
    noDismiss: true,
    allowSuppress: false,
  });

  await api.ext?.ensureLoggedIn?.();

  try {
    await downloadAndEnableLatestModVersionAsync(api, HARMONY_MOD_ID);
  } catch (err) {
    api.showErrorNotification?.(t("Failed to download/install Harmony"), err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.("harmony-installing");
  }
};

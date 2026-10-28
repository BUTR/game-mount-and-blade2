import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import {
  BLSE_MOD_ID,
  BLSE_URL,
  GAME_ID,
  HARMONY_MOD_ID,
  HARMONY_URL,
} from "../common";
import { deployModsAsync } from "../vortex/deploy";
import { downloadAndEnableLatestModVersionAsync } from "../vortex/modDownloader";
import { findModDownload } from "../vortex/modFinder";
import { LocalizationManager } from "../localization/manager";
import { IStateWithBannerlord } from "../types";
import { bselectors } from "../selectors";
import { actionsSettings } from "../settings/actions";

export const findBLSEDownload = (
  api: types.IExtensionApi,
): string | undefined => {
  return findModDownload(api, 1);
};

export const deployBLSEAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await deployModsAsync(api);
  await util.toPromise((cb) =>
    api.events.emit("start-quick-discovery", () => cb(null)),
  );

  const state = api.getState<IStateWithBannerlord>();

  const discovery = selectors.currentGameDiscovery(state);
  const tool = discovery?.tools?.["blse-cli"];
  if (tool) {
    // A singleplayer tool: in the multiplayer mode it becomes the primary tool once switching back
    api.store?.dispatch(
      bselectors.activeGameMode(state) === "singleplayer"
        ? actions.setPrimaryTool(GAME_ID, tool.id)
        : actionsSettings.setModePrimaryTool("singleplayer", tool.id),
    );
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
    util.opn(HARMONY_URL).catch(() => null);
  } finally {
    api.dismissNotification?.("harmony-installing");
  }
};

import { actions, selectors, types, util } from "vortex-api";
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import { BLSE_MOD_ID, BLSE_URL, GAME_ID, HARMONY_MOD_ID } from "../common";
import { downloadAndEnableLatestModVersionAsync, isModActive } from "../vortex";
import { LocalizationManager } from "../localization";
import { bselectors } from "../selectors";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IStateWithBannerlord,
} from "../types";

const isModBLSE = (mod: IBannerlordMod): boolean => {
  return (
    mod.type === `bannerlord-blse` ||
    (mod.attributes?.modId === 1 && mod.attributes?.source === `nexus`)
  );
};

export const findBLSEMod = (
  mods: IBannerlordModStorage,
): IBannerlordMod | undefined => {
  const blseMods: IBannerlordMod[] = Object.values(mods).filter(
    (mod: IBannerlordMod) => isModBLSE(mod),
  );

  if (blseMods.length === 0) return undefined;

  if (blseMods.length === 1) return blseMods[0];

  return blseMods.reduce<IBannerlordMod | undefined>(
    (prev: IBannerlordMod | undefined, iter: IBannerlordMod) => {
      if (!prev) {
        return iter;
      }
      const compareResult = BannerlordModuleManager.compareVersions(
        BannerlordModuleManager.parseApplicationVersion(
          iter.attributes?.version ?? "",
        ),
        BannerlordModuleManager.parseApplicationVersion(
          prev.attributes?.version ?? "",
        ),
      );
      switch (compareResult) {
        case 1:
          return iter;
        case -1:
          return prev;
        default:
          return iter;
      }
    },
    undefined,
  );
};

export const findBLSEDownload = (
  api: types.IExtensionApi,
): string | undefined => {
  const state = api.getState();
  const downloadedFiles = bselectors.downloadFiles(state);
  if (downloadedFiles === undefined) {
    return undefined;
  }

  const blseFiles = Object.entries(downloadedFiles)
    .filter(([, download]) => download.game.includes(GAME_ID))
    .filter(([, download]) => download.modInfo?.["nexus"]?.ids?.modId === 1)
    .sort(
      ([, downloadA], [, downloadB]) => downloadA.fileTime - downloadB.fileTime,
    );

  if (blseFiles.length === 0) {
    return undefined;
  }

  const [downloadId, _download] = blseFiles[0]!;

  return downloadId;
};

export const isActiveBLSE = (api: types.IExtensionApi): boolean => {
  const state = api.getState<IStateWithBannerlord>();

  const blse = bselectors.blseMod(state);
  if (!blse) {
    return false;
  }

  const profile = selectors.activeProfile(state);
  return isModActive(profile, blse);
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

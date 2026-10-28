import { types, util } from "@nexusmods/vortex-api";
import { isStoreSteam } from "./store";
import {
  addBLSETools,
  addModdingKitTool,
  addOfficialCLITool,
  addOfficialLauncherTool,
  addOfficialMultiplayerCLITool,
} from "./tools";
import { recommendBLSEAsync } from "../blse/deploy";
import { VortexLauncherManager } from "../launcher/manager";
import { ensureNativeLogger } from "../launcher/logger";
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from "../common";
import { LocalizationManager } from "../localization/manager";

const launchGameStoreAsync = async (
  api: types.IExtensionApi,
  store: string,
): Promise<void> => {
  await util.GameStoreHelper.launchGameStore(api, store, undefined, true).catch(
    (err) => {
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Failed to launch the game store"), err);
    },
  );
};

/**
 * What depends on the game's folder and store: the tools, their paths are absolute, and the launcher manager's store.
 * On setup, and again when the folder or store changes, Vortex doesn't set the game up again for that
 */
export const applyDiscovery = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): void => {
  addOfficialCLITool(api, discovery);
  addOfficialMultiplayerCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  addBLSETools(api, discovery);

  if (discovery.store !== undefined) {
    VortexLauncherManager.getInstance(api).setStore(discovery.store);
  }
};

export const setupAsync = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  // The first Bannerlord-only step, everything below needs the native library
  ensureNativeLogger();

  applyDiscovery(api, discovery);

  await recommendBLSEAsync(api, discovery);

  if (isStoreSteam(discovery.store)) {
    await launchGameStoreAsync(api, discovery.store);
  }
};

export const findGameAsync = async (): Promise<types.IGameStoreEntry> => {
  return await util.GameStoreHelper.findByAppId([
    EPICAPP_ID,
    STEAMAPP_ID.toString(),
    ...GOG_IDS,
    XBOX_ID,
  ]);
};

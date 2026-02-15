import { types, util } from "vortex-api";
import { isStoreSteam, isStoreXbox } from "./store";
import {
  addBLSETools,
  addModdingKitTool,
  addOfficialCLITool,
  addOfficialLauncherTool,
} from "./tools";
import { recommendBLSEAsync } from "../blse";
import { VortexLauncherManager } from "../launcher";
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from "../common";
import { LocalizationManager } from "../localization";

type RequiresLauncherResult = {
  launcher: string;
  addInfo?: unknown;
};

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

const prepareForModdingAsync = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  await recommendBLSEAsync(api, discovery);

  if (isStoreSteam(discovery.store)) {
    await launchGameStoreAsync(api, discovery.store);
  }

  if (discovery.store !== undefined) {
    const launcherManager = VortexLauncherManager.getInstance(api);

    launcherManager.setStore(discovery.store);
  }
};

export const setupAsync = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  // Quickly ensure that the official Launcher is added.
  addOfficialCLITool(api, discovery);
  addOfficialLauncherTool(api, discovery);
  addModdingKitTool(api, discovery);
  addBLSETools(api, discovery);

  await prepareForModdingAsync(api, discovery);
};

export const requiresLauncher = (
  store?: string,
): RequiresLauncherResult | null => {
  if (isStoreXbox(store)) {
    return {
      launcher: `xbox`,
      addInfo: {
        appId: XBOX_ID,
        parameters: [
          {
            appExecName: `bin.Gaming.Desktop.x64.Shipping.Client.Launcher.Native`,
          },
        ],
      },
    };
  }
  // The API doesn't expect undefined, but it's allowed
  return null;
};

export const findGameAsync = async (): Promise<types.IGameStoreEntry> => {
  return await util.GameStoreHelper.findByAppId([
    EPICAPP_ID,
    STEAMAPP_ID.toString(),
    ...GOG_IDS,
    XBOX_ID,
  ]);
};

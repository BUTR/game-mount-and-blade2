import { log, selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { recommendBLSEAsync } from "../blse/deploy";
import { VortexLauncherManager } from "../launcher/manager";
import { applyGameModeTools } from "./gameModeTools";
import { applyDiscovery } from "./utils";

/**
 * Picking another folder for the game, like the GOG install after the Steam one, changes its folder and store
 * without setting the game up again. What setup derived from them is applied again while Bannerlord is active,
 * otherwise its next setup does it
 */
export const watchGameDiscovery = (api: types.IExtensionApi): void => {
  const discoveryKey = (): string => {
    const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
    return `${discovery?.path ?? ""}|${discovery?.store ?? ""}`;
  };

  let last = discoveryKey();
  // The tools are part of the discovery, adding them again changes it but not the key
  api.onStateChange?.(["settings", "gameMode", "discovered", GAME_ID], () => {
    const current = discoveryKey();
    if (current === last) {
      return;
    }
    last = current;

    const state = api.getState();
    const discovery = selectors.discoveryByGame(state, GAME_ID);
    if (
      discovery?.path === undefined ||
      selectors.activeGameId(state) !== GAME_ID
    ) {
      return;
    }

    applyDiscovery(api, discovery);
    // The tools are added again visible, the other mode's are hidden again
    applyGameModeTools(api);
    // Another folder may not have BLSE
    recommendBLSEAsync(api, discovery).catch((err) =>
      log("warn", "Failed to check BLSE for the game folder", err),
    );
    // The modules the launcher manager has are of the folder before
    VortexLauncherManager.getInstance(api)
      .refreshModulesAsync()
      .catch((err) =>
        log("warn", "Failed to read the modules of the game folder", err),
      );
  });
};

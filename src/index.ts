import { method as toBluebird } from "bluebird";
import { log, selectors, types } from "@nexusmods/vortex-api";
import path from "path";
import { GAME_ID } from "./common";
import { SavePage } from "./views/Saves/SavePage";
import { SavePageOptions } from "./views/Saves/options";
import { ServersPage } from "./views/Servers/ServersPage";
import { ServersPageOptions } from "./views/Servers/options";
import { Settings, SettingsProps } from "./views/Settings/Settings";
import { BannerlordGame } from "./vortex/game";
import { getGameInstallPath } from "./vortex/modType";
import { IAddedFiles } from "./types";
import { reducerSession } from "./store/reducersSession";
import { reducerSettings } from "./store/reducersSettings";
import { actionsSettings } from "./settings/actions";
import { registerCollections } from "./collections/register";
import { willRemoveModCollectionsAsync } from "./collections/events";
import {
  didDeployLoadOrderAsync,
  gamemodeActivatedLoadOrderAsync,
} from "./loadOrder/events";
import { registerLoadOrder } from "./loadOrder/register";
import { watchActiveProfileType } from "./loadOrder/gameMode";
import { didDeployBLSEAsync, didPurgeBLSEAsync } from "./blse/events";
import { installBLSEAsync, testBLSEAsync } from "./blse/installer";
import { isModTypeBLSE } from "./blse/modType";
import { VortexLauncherManagerLogger } from "./launcher/logger";
import { gamemodeActivatedSaveAsync } from "./save/events";
import { addedFilesEventAsync, installedMod } from "./vortex/events";
import { registerVortexModTypes } from "./vortex/register";
import { version } from "../package.json";
import { watchNoModsProfile } from "./servers/noModsProfile";
import { watchProfiles } from "./servers/profileWatch";
import {
  applyGameModeTools,
  watchBLSEState,
  watchPrimaryTool,
} from "./vortex/gameModeTools";
import { watchGameModeMenu } from "./vortex/gameModeMenu";
import { registerProfileType } from "./profileType/register";
import { watchDocumentWhileActive } from "./profileType/documentWatcher";
import { watchMenuItems } from "./profileType/menuItems";
import { watchProfileCards } from "./profileType/profileCards";
import { watchProfileTypes } from "./profileType/assignTypes";

// TODO: Better dialogs with settings
let logger: VortexLauncherManagerLogger | null = null;

const main = (context: types.IExtensionContext): boolean => {
  log("info", `Extension Version: ${version}`);

  // Vortex skips the extension on older versions, including 1.x, instead of loading it
  context.requireVersion(`>=${__VORTEX_API_VERSION__}`);

  // Reducers
  context.registerReducer(
    /*path:*/ [`settings`, GAME_ID],
    /*spec:*/ reducerSettings,
  );
  context.registerReducer(
    /*path:*/ [`session`, GAME_ID],
    /*spec:*/ reducerSession,
  );

  // Settings UI
  context.registerSettings(
    /*title:*/ `Interface`,
    /*element:*/ Settings,
    /*props?:*/ (): SettingsProps => ({
      onSetSortOnDeploy: (profileId: string, sort: boolean) =>
        context.api.store?.dispatch(
          actionsSettings.setSortOnDeploy(profileId, sort),
        ),
      onSetFixCommonIssues: (profileId: string, fixCommonIssues: boolean) =>
        context.api.store?.dispatch(
          actionsSettings.setFixCommonIssues(profileId, fixCommonIssues),
        ),
      onSetBetaSorting: (profileId: string, betaSorting: boolean) =>
        context.api.store?.dispatch(
          actionsSettings.setBetaSorting(profileId, betaSorting),
        ),
    }),
    /*visible?:*/ () => {
      return selectors.activeGameId(context.api.getState()) === GAME_ID;
    },
    /*priority?:*/ 51,
  );

  // Game
  context.registerGame(new BannerlordGame(context.api));

  // Collections
  registerCollections(context);

  // Load Order & Actions
  registerLoadOrder(context);

  // Save Viewer
  context.registerMainPage(
    /*icon:*/ "savegame",
    /*title:*/ "Saves",
    /*element:*/ SavePage,
    /*options:*/ new SavePageOptions(context),
  );

  // Server Browser
  context.registerMainPage(
    /*icon:*/ "connection",
    /*title:*/ "Servers",
    /*element:*/ ServersPage,
    /*options:*/ new ServersPageOptions(context),
  );

  // Profile types
  registerProfileType(context);

  // BLSE Installer & Mod Type
  context.registerInstaller(
    /*id:*/ "bannerlord-blse-installer",
    /*priority:*/ 30,
    /*testSupported:*/ async (files: string[], gameId: string) => {
      if (GAME_ID !== gameId) {
        return undefined!;
      }

      return await testBLSEAsync(files, gameId);
    },
    /*install:*/
    async (files: string[], _destinationPath: string, gameId: string) => {
      if (GAME_ID !== gameId) {
        return undefined!;
      }

      return await installBLSEAsync(context.api, files);
    },
  );
  context.registerModType(
    /*id:*/ "bannerlord-blse",
    /*priority:*/ 30,
    /*isSupported:*/ (gameId) => gameId === GAME_ID,
    /*getPath:*/ (game) => getGameInstallPath(context.api, game),
    /*test:*/ toBluebird(isModTypeBLSE),
  );

  // Module, Translation Installers & Mod Types
  registerVortexModTypes(context);

  context.once(() => {
    context.api.setStylesheet(
      "bannerlord-modern",
      path.join(__dirname, "modern.scss"),
    );
    context.api.setStylesheet(
      "savegame",
      path.join(__dirname, "savegame.scss"),
    );
    context.api.setStylesheet("servers", path.join(__dirname, "servers.scss"));

    watchProfileTypes(context.api);
    watchNoModsProfile(context.api);
    watchProfiles(context.api);
    watchPrimaryTool(context.api);
    watchBLSEState(context.api);
    watchGameModeMenu(context.api);
    watchProfileCards(context.api);
    watchMenuItems(context.api);
    // After the document's watchers, only while Bannerlord is the active game
    watchDocumentWhileActive(context.api);
    watchActiveProfileType(context.api);

    context.api.events.on("gamemode-activated", async (gameId: string) => {
      if (GAME_ID !== gameId) {
        return;
      }

      // Vortex picks the defaultPrimary tool on activation, which is BLSE regardless of the mode
      applyGameModeTools(context.api);

      await gamemodeActivatedLoadOrderAsync(context.api);
      await gamemodeActivatedSaveAsync(context.api);
    });

    // Each profile has its own mode
    context.api.events.on("profile-did-change", (profileId: string): void => {
      const profile = selectors.profileById(context.api.getState(), profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      applyGameModeTools(context.api);
    });

    context.api.events.on(
      "did-install-mod",
      (gameId: string, archiveId: string, modId: string): void => {
        if (GAME_ID !== gameId) {
          return;
        }

        installedMod(context.api, archiveId, modId);
      },
    );

    context.api.onAsync(
      `added-files`,
      async (profileId: string, files: IAddedFiles[]) => {
        const state = context.api.getState();

        const profile = selectors.profileById(state, profileId);
        if (profile?.gameId !== GAME_ID) {
          return;
        }

        await addedFilesEventAsync(context.api, files);
      },
    );

    // TODO: listen to profile switch events and check for BLSE
    context.api.onAsync("did-deploy", async (profileId: string) => {
      const state = context.api.getState();

      const profile = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await didDeployLoadOrderAsync(context.api);
      await didDeployBLSEAsync(context.api);
    });

    context.api.onAsync("did-purge", async (profileId: string) => {
      const state = context.api.getState();

      const profile = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await didPurgeBLSEAsync(context.api);
    });

    context.api.onAsync(
      "will-remove-mod",
      async (gameId: string, modId: string) => {
        if (GAME_ID !== gameId) {
          return;
        }

        await willRemoveModCollectionsAsync(context.api, modId);
      },
    );

    // Logger
    if (logger === null) {
      logger = new VortexLauncherManagerLogger();
      logger.useVortexFunctions();
    }
  });

  return true;
};

export default main;

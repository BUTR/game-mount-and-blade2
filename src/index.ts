import { method as toBluebird } from "bluebird";
import { log, selectors, types } from "@nexusmods/vortex-api";
import path from "path";
import { GAME_ID } from "@bannerlord/core/common";
import { Settings, SettingsProps } from "./views/Settings/Settings";
import { BannerlordGame } from "@bannerlord/core/vortex/game";
import { getGameInstallPath } from "@bannerlord/core/vortex/modType";
import { IAddedFiles } from "@bannerlord/core/types";
import { reducerSession } from "./store/reducersSession";
import { reducerSettings } from "./store/reducersSettings";
import { actionsSettings } from "@bannerlord/core/settings/actions";
import { registerCollections } from "@bannerlord/collections/register";
import { willRemoveModCollectionsAsync } from "@bannerlord/collections/events";
import {
  didDeployLoadOrderAsync,
  gamemodeActivatedLoadOrderAsync,
} from "@bannerlord/core/loadOrder/events";
import { registerLoadOrder } from "./loadOrder/register";
import { watchActiveProfileType } from "@bannerlord/core/loadOrder/gameMode";
import {
  didDeployBLSEAsync,
  didPurgeBLSEAsync,
} from "@bannerlord/core/blse/events";
import {
  installBLSEAsync,
  testBLSEAsync,
} from "@bannerlord/core/blse/installer";
import { isModTypeBLSE } from "@bannerlord/core/blse/modType";
import { recommendBLSEAsync } from "@bannerlord/core/blse/deploy";
import { gamemodeActivatedSaveAsync } from "@bannerlord/saves/events";
import { registerSaves } from "@bannerlord/saves/register";
import {
  addedFilesEventAsync,
  installedMod,
} from "@bannerlord/core/vortex/events";
import { fillModuleAttributesAsync } from "@bannerlord/core/vortex/moduleAttributes";
import { registerVortexModTypes } from "./vortex/register";
import {
  registerServers,
  watchServerProfiles,
} from "@bannerlord/servers/register";
import {
  applyGameModeTools,
  watchBLSEState,
  watchPrimaryTool,
} from "@bannerlord/core/vortex/gameModeTools";
import { watchGameModeMenu } from "@bannerlord/core/vortex/gameModeMenu";
import { registerProfileType } from "@bannerlord/core/profileType/register";
import { watchDocumentWhileActive } from "@bannerlord/core/profileType/documentWatcher";
import { watchMenuItems } from "@bannerlord/core/profileType/menuItems";
import { watchProfileCards } from "@bannerlord/core/profileType/profileCards";
import { watchProfileTypes } from "@bannerlord/core/profileType/assignTypes";
import { watchGameDiscovery } from "@bannerlord/core/vortex/discoveryWatcher";
import { watchBannerCaches } from "@bannerlord/ui/bannerCaches";
import { watchRemovedProfiles } from "@bannerlord/core/profileType/removedProfiles";
import { warnAboutOtherCopies } from "@bannerlord/core/vortex/duplicateExtensions";
import { registerVerifyFiles } from "@bannerlord/verify-files/register";

const main = (context: types.IExtensionContext): boolean => {
  log("info", `Extension Version: ${__EXTENSION_VERSION__}`);

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

  // The pages' shared styles, before the pages add their own
  context.once(() => {
    context.api.setStylesheet(
      "bannerlord-modern",
      path.join(__dirname, "modern.scss"),
    );
  });

  // Game
  context.registerGame(new BannerlordGame(context.api));

  // Collections
  registerCollections(context);

  // Load Order & Actions
  registerLoadOrder(context);

  // Save Viewer
  registerSaves(context);

  // Server Browser
  registerServers(context);

  // Verify Files+
  registerVerifyFiles(context);

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
    watchProfileTypes(context.api);
    watchServerProfiles(context.api);
    watchRemovedProfiles(context.api);
    watchPrimaryTool(context.api);
    watchBLSEState(context.api);
    watchGameModeMenu(context.api);
    watchProfileCards(context.api);
    watchMenuItems(context.api);
    // After the document's watchers, only while Bannerlord is the active game
    watchDocumentWhileActive(context.api);
    watchActiveProfileType(context.api);
    watchGameDiscovery(context.api);
    watchBannerCaches(context.api);

    context.api.events.on("gamemode-activated", async (gameId: string) => {
      if (GAME_ID !== gameId) {
        return;
      }

      // Vortex picks the defaultPrimary tool on activation, which is BLSE regardless of the mode
      applyGameModeTools(context.api);

      // The module ids before the load order reads them, or its modules show as not managed by Vortex
      await fillModuleAttributesAsync(context.api, { idsOnly: true });

      await gamemodeActivatedLoadOrderAsync(context.api);
      await gamemodeActivatedSaveAsync(context.api);

      // The module entries of mods installed before the installer kept them, nothing waits for these
      fillModuleAttributesAsync(context.api).catch((err) =>
        log("warn", "Failed to record the modules of mods", err),
      );
    });

    // Each profile has its own mode
    context.api.events.on("profile-did-change", (profileId: string): void => {
      const profile = selectors.profileById(context.api.getState(), profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      applyGameModeTools(context.api);

      // The setup only recommends BLSE for the profile active on activation
      const discovery = selectors.discoveryByGame(
        context.api.getState(),
        GAME_ID,
      );
      if (discovery?.path !== undefined) {
        recommendBLSEAsync(context.api, discovery).catch((err) =>
          log("warn", "Failed to check BLSE for the profile", err),
        );
      }
    });

    context.api.events.on(
      "did-install-mod",
      (gameId: string, archiveId: string, modId: string): void => {
        if (GAME_ID !== gameId) {
          return;
        }

        installedMod(context.api, archiveId, modId);
        // A mod another installer, like FOMOD, installed
        fillModuleAttributesAsync(context.api, { modIds: [modId] }).catch(
          (err) => log("warn", "Failed to record the modules of a mod", err),
        );
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

    // Last, after everything the extension needs is registered
    warnAboutOtherCopies(context.api);
  });

  return true;
};

export default main;

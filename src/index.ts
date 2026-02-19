import { method as toBluebird } from "bluebird";
import { log, selectors, types } from "vortex-api";
import * as semver from "semver";
import path from "path";
import { GAME_ID } from "./common";
import { SavePage, SavePageOptions, Settings, SettingsProps } from "./views";
import { BannerlordGame, getGameInstallPath } from "./vortex";
import { IAddedFiles } from "./types";
import { reducerSession, reducerSettings } from "./store";
import { actionsSettings } from "./settings";
import {
  registerCollections,
  willRemoveModCollectionsAsync,
} from "./collections";
import {
  didDeployLoadOrderAsync,
  gamemodeActivatedLoadOrderAsync,
  registerLoadOrder,
} from "./loadOrder";
import {
  didDeployBLSEAsync,
  didPurgeBLSEAsync,
  installBLSEAsync,
  isModTypeBLSE,
  testBLSEAsync,
} from "./blse";
import { VortexLauncherManagerLogger } from "./launcher";
import { gamemodeActivatedSaveAsync } from "./save";
import {
  addedFilesEventAsync,
  installedMod,
  registerVortexModTypes,
} from "./vortex";
import { LocalizationManager } from "./localization";
import { version } from "../package.json";

// TODO: Better dialogs with settings
let logger: VortexLauncherManagerLogger | null = null;

const main = (context: types.IExtensionContext): boolean => {
  log("info", `Extension Version: ${version}`);

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

  // BLSE Installer & Mod Type
  context.registerInstaller(
    /*id:*/ "bannerlord-blse-installer",
    /*priority:*/ 30,
    /*testSupported:*/ toBluebird(async (files: string[], gameId: string) => {
      if (GAME_ID !== gameId) {
        return undefined!;
      }

      return await testBLSEAsync(files, gameId);
    }),
    /*install:*/ toBluebird(
      async (files: string[], _destinationPath: string, gameId: string) => {
        if (GAME_ID !== gameId) {
          return undefined!;
        }

        return await installBLSEAsync(context.api, files);
      },
    ),
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

  // Event Callbacks
  const checkVortexVersion = async (): Promise<void> => {
    const state = context.api.getState();

    const vortexVersion = semver.coerce(state.app.appVersion)!.version;
    if (
      !semver.satisfies(vortexVersion, "<=1.13.3") &&
      !semver.satisfies(vortexVersion, ">=1.14.0")
    ) {
      const { localize: t } = LocalizationManager.getInstance(context.api);

      await context.api.showDialog?.(
        "info",
        t(`Unsupported Vortex Version!`),
        {
          text: t(
            `You are using an unsupported Vortex version! Either upgrade to 1.14.0 or higher or downgrade to 1.13.3 or lower!`,
          ),
        },
        [{ label: t("Close") }],
      );
    }
  };

  context.once(() => {
    context.api.setStylesheet(
      "savegame",
      path.join(__dirname, "savegame.scss"),
    );

    context.api.events.on("gamemode-activated", async (gameId: string) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await checkVortexVersion();

      await gamemodeActivatedLoadOrderAsync(context.api);
      await gamemodeActivatedSaveAsync(context.api);
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

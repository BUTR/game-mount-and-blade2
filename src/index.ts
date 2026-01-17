import { method as toBluebird } from "bluebird";
import { log, selectors, types } from "vortex-api";
import { TFunction } from "vortex-api/lib/util/i18n";
import * as semver from "semver";
import path from "path";
import { GAME_ID } from "./common";
import {
  BannerlordGeneralDataPage,
  ModOptionsDataPage,
  SavePage,
  SavePageOptions,
  Settings,
  SettingsProps,
  DetailsRenderer,
} from "./views";
import { BannerlordGame } from "./game";
import { IAddedFiles, IBannerlordModStorage } from "./types";
import { reducerSession, reducerSettings } from "./react";
import { actionsSettings } from "./settings";
import {
  cloneCollectionGeneralDataAsync,
  cloneCollectionModOptionsDataAsync,
  genCollectionGeneralDataAsync,
  genCollectionModOptionsDataAsync,
  hasContextWithCollectionFeature,
  ICollectionData,
  parseCollectionGeneralDataAsync,
  parseCollectionLegacyDataAsync,
  parseCollectionModOptionsDataAsync,
  willRemoveModCollectionsAsync,
} from "./collections";
import {
  didDeployLoadOrderAsync,
  gamemodeActivatedLoadOrderAsync,
  LoadOrderManager,
  toggleLoadOrderAsync,
} from "./loadOrder";
import {
  didDeployBLSEAsync,
  didPurgeBLSEAsync,
  getInstallPathBLSE,
  installBLSEAsync,
  isModTypeBLSE,
  testBLSEAsync,
} from "./blse";
import { VortexLauncherManager } from "./launcher";
import { gamemodeActivatedSaveAsync } from "./save";
import {
  addedFilesEventAsync,
  getInstallPathModule,
  getPersistentBannerlordMods,
  getPersistentLoadOrder,
  installedMod,
  isModTypeModule,
} from "./vortex";
import { LocalizationManager } from "./localization";
import {
  isModTranslationArchive,
  isModTypeTranslation,
  modTranslationInstaller,
} from "./vortex/modTranslation";
import { version } from "../package.json";
import { VortexLauncherManagerLogger } from "./launcher/logger";
import React from "react";

// TODO: Better dialogs with settings
let logger: VortexLauncherManagerLogger | null = null;

const main = (context: types.IExtensionContext): boolean => {
  log("info", `Extension Version: ${version}`);

  context.registerReducer(
    /*path:*/ [`settings`, GAME_ID],
    /*spec:*/ reducerSettings,
  );
  context.registerReducer(
    /*path:*/ [`session`, GAME_ID],
    /*spec:*/ reducerSession,
  );

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

  context.registerGame(new BannerlordGame(context.api));

  if (hasContextWithCollectionFeature(context)) {
    context.optional.registerCollectionFeature(
      /*id:*/ `${GAME_ID}_load_order`,
      /*generate:*/ async (
        gameId: string,
        includedModIds: string[],
        _mod: types.IMod,
      ) => {
        if (GAME_ID !== gameId) {
          return {};
        }

        const state = context.api.getState();
        const profile = selectors.activeProfile(state);
        const loadOrder = getPersistentLoadOrder(state.persistent, profile?.id);
        const mods = getPersistentBannerlordMods(state.persistent);

        const includedMods = Object.values(mods)
          .filter((mod) => includedModIds.includes(mod.id))
          .reduce<IBannerlordModStorage>((map, obj) => {
            map[obj.id] = obj;
            return map;
          }, {});

        return await genCollectionGeneralDataAsync(
          profile,
          loadOrder,
          includedMods,
        );
      },
      /*parse:*/ async (
        gameId: string,
        collection: ICollectionData,
        _mod: types.IMod,
      ) => {
        if (GAME_ID !== gameId) {
          return;
        }

        await parseCollectionLegacyDataAsync(context.api, collection);
        await parseCollectionGeneralDataAsync(context.api, collection);
      },
      /*clone:*/
      async (
        gameId: string,
        collection: ICollectionData,
        from: types.IMod,
        to: types.IMod,
      ) => {
        if (GAME_ID !== gameId) {
          return;
        }
        await cloneCollectionGeneralDataAsync(
          context.api,
          gameId,
          collection,
          from,
          to,
        );
      },
      /*title:*/ (t: TFunction) => {
        return t(`Requirements & Load Order`);
      },
      /*condition?:*/ (_state: types.IState, gameId: string) => {
        return gameId === GAME_ID;
      },
      /*editComponent?:*/ BannerlordGeneralDataPage,
    );

    context.optional.registerCollectionFeature(
      /*id:*/ `${GAME_ID}_mod_options`,
      /*generate:*/ async (
        gameId: string,
        _includedMods: string[],
        mod: types.IMod,
      ) => {
        if (GAME_ID !== gameId) {
          return {};
        }
        return await genCollectionModOptionsDataAsync(context.api, mod);
      },
      /*parse:*/ async (
        gameId: string,
        collection: ICollectionData,
        mod: types.IMod,
      ) => {
        if (GAME_ID !== gameId) {
          return;
        }

        await parseCollectionModOptionsDataAsync(context.api, collection, mod);
      },
      /*clone:*/ async (
        gameId: string,
        collection: ICollectionData,
        from: types.IMod,
        to: types.IMod,
      ) => {
        if (GAME_ID !== gameId) {
          return;
        }

        await cloneCollectionModOptionsDataAsync(
          context.api,
          gameId,
          collection,
          from,
          to,
        );
      },
      /*title:*/ (t: TFunction) => {
        return t(`Mod Options`);
      },
      /*condition?:*/ (_state: types.IState, gameId: string) => {
        return gameId === GAME_ID;
      },
      /*editComponent?:*/ ModOptionsDataPage,
    );
  }

  context.registerLoadOrder(
    /*gameInfo:*/ LoadOrderManager.getInstance(context.api),
  );

  context.registerMainPage(
    /*icon:*/ "savegame",
    /*title:*/ "Saves",
    /*element:*/ SavePage,
    /*options:*/ new SavePageOptions(context),
  );

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
    /*getPath:*/ (game) => getInstallPathBLSE(context.api, game),
    /*test:*/ toBluebird(isModTypeBLSE),
  );

  context.registerInstaller(
    /*id:*/ `bannerlord-module-installer`,
    /*priority:*/ 25,
    /*testSupported:*/ toBluebird(async (files: string[], gameId: string) => {
      if (GAME_ID !== gameId) {
        return undefined!;
      }

      const launcherManager = VortexLauncherManager.getInstance(context.api);
      return await launcherManager.testModule(files, gameId);
    }),
    /*install:*/ toBluebird(
      async (
        files: string[],
        destinationPath: string,
        gameId: string,
        _progressDelegate: types.ProgressDelegate,
        _choices?: unknown,
        _unattended?: boolean,
        archivePath?: string,
      ) => {
        if (GAME_ID !== gameId) {
          return undefined!;
        }

        const launcherManager = VortexLauncherManager.getInstance(context.api);
        return await launcherManager.installModuleAsync(
          files,
          destinationPath,
          archivePath,
        );
      },
    ),
  );
  context.registerModType(
    /*id:*/ "bannerlord-module",
    /*priority:*/ 25,
    /*isSupported:*/ (gameId) => gameId === GAME_ID,
    /*getPath:*/ (game) => getInstallPathModule(context.api, game),
    /*test:*/ toBluebird(isModTypeModule),
  );

  context.registerInstaller(
    /*id:*/ `bannerlord-translation-installer`,
    /*priority:*/ 30,
    /*testSupported:*/ toBluebird(isModTranslationArchive),
    /*install:*/ toBluebird(
      async (
        files: string[],
        destinationPath: string,
        gameId: string,
        _progressDelegate: types.ProgressDelegate,
        _choices?: unknown,
        _unattended?: boolean,
        archivePath?: string,
      ) => {
        if (GAME_ID !== gameId) {
          return undefined!;
        }

        return await modTranslationInstaller(
          context.api,
          files,
          destinationPath,
          gameId,
          _progressDelegate,
          _choices,
          _unattended,
          archivePath,
        );
      },
    ),
  );

  context.registerModType(
    /*id:*/ "bannerlord-translation",
    /*priority:*/ 30,
    /*isSupported:*/ (gameId) => gameId === GAME_ID,
    /*getPath:*/ (game) => getInstallPathModule(context.api, game),
    /*test:*/ toBluebird(isModTypeTranslation),
  );

  // Show detected translation languages in the Mods side panel (Details)
  context.registerTableAttribute("mods", {
    id: "translationLanguagesText",
    name: "Translations Available",
    description: "Detected languages included in this translation mod",
    placement: "detail",
    position: 76,
    help: "List of languages found under ModuleData/Languages",
    isSortable: false,
    isGroupable: false,
    condition: () => selectors.activeGameId(context.api.getState()) === GAME_ID,
    calc: (mod: types.IMod) => mod?.attributes?.["translationLanguagesText"],
    customRenderer: (mod: types.IMod, detailCell: boolean) => {
      return React.createElement(DetailsRenderer, { mod: mod, detailCell }, []);
    },
    edit: {},
  });

  const isMB2 = (): boolean => {
    const state = context.api.getState();
    const activeGame = selectors.activeGameId(state);
    return activeGame === GAME_ID;
  };

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 200,
    /*iconOrComponent:*/ `loot-sort`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Auto Sort`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      void launcherManager.autoSortAsync();
    },
    /*condition?:*/ isMB2,
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 210,
    /*iconOrComponent:*/ `checkbox-checked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Enable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      void toggleLoadOrderAsync(context.api, true);
    },
    /*condition?:*/ isMB2,
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 215,
    /*iconOrComponent:*/ `checkbox-unchecked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Disable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      void toggleLoadOrderAsync(context.api, false);
    },
    /*condition?:*/ isMB2,
  );

  // Import from Novus
  // Import from LauncherEx
  // Export to LauncherEx

  /* Disabled for now because the name is too long
  context.registerAction(
    `fb-load-order-icons`,
    201,
    `changelog`,
    {},
    `Fetch Compatibility Scores`,
    (_instanceIds?: string[]): boolean | void => {
      const loadOrderManager = LoadOrderManager.getInstance(context.api);
      loadOrderManager.updateCompatibilityScores();
    },
    isMB2
  );
  */

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

  // Register Callbacks
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
  });

  context.once(() => {
    if (logger === null) {
      logger = new VortexLauncherManagerLogger();
      logger.useVortexFunctions();
    }
  });
  // Register Callbacks

  return true;
};

export default main;

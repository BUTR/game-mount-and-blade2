import { method as toBluebird } from "bluebird";
import React from "react";
import { selectors, types } from "vortex-api";
import { GAME_ID } from "../common";
import { DetailsRenderer } from "../views";
import { VortexLauncherManager } from "../launcher";
import { getGameInstallPath, isModTypeModule } from "./modType";
import {
  isModTranslationArchive,
  isModTypeTranslation,
  modTranslationInstaller,
} from "./modTranslation";

export const registerVortexModTypes = (
  context: types.IExtensionContext,
): void => {
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
    /*getPath:*/ (game) => getGameInstallPath(context.api, game),
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
    /*getPath:*/ (game) => getGameInstallPath(context.api, game),
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
    customRenderer: (mod: types.IMod, _detailCell: boolean) => {
      return React.createElement(DetailsRenderer, { mod }, []);
    },
    edit: {},
  });
};

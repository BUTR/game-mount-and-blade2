// eslint-disable-next-line no-restricted-imports
import Bluebird, { method as toBluebird } from 'bluebird';
import { log, selectors, types } from 'vortex-api';
import { TFunction } from 'vortex-api/lib/util/i18n';
import path from 'path';
import { GAME_ID } from './common';
import {
  BannerlordGeneralDataPage,
  ModOptionsDataPage,
  SavePage,
  SavePageOptions,
  Settings,
  SettingsProps,
} from './views';
import { BannerlordGame } from './game';
import { IAddedFiles } from './types';
import { reducer } from './react';
import { actionsSettings } from './settings';
import {
  cloneCollectionGeneralData,
  cloneCollectionModOptionsData,
  genCollectionGeneralData,
  genCollectionModOptionsData,
  hasContextWithCollectionFeature,
  hasGeneralData,
  hasLegacyData,
  hasModOptionsData,
  ICollectionData,
  parseCollectionGeneralData,
  parseCollectionLegacyData,
  parseCollectionModOptionsData,
  willRemoveModCollections,
} from './collections';
import { didDeployLoadOrder, gamemodeActivatedLoadOrder, LoadOrderManager } from './loadOrder';
import { didDeployBLSE, didPurgeBLSE, getInstallPathBLSE, installBLSE, isModTypeBLSE, testBLSE } from './blse';
import { VortexLauncherManager } from './launcher';
import { getInstallPathModule, isModTypeModule } from './module';
import { gamemodeActivatedSave } from './save';
import { addedFilesEvent } from './vortex';
import { version } from '../package.json';

// TODO: Better dialogs with settings

const main = (context: types.IExtensionContext): boolean => {
  log('info', `Extension Version: ${version}`);

  context.registerReducer(/*path:*/ [`settings`, GAME_ID], /*spec:*/ reducer);

  context.registerSettings(
    /*title:*/ `Interface`,
    /*element:*/ Settings,
    /*props?:*/ (): SettingsProps => ({
      onSetSortOnDeploy: (profileId: string, sort: boolean) =>
        context.api.store?.dispatch(actionsSettings.setSortOnDeploy(profileId, sort)),
      onSetFixCommonIssues: (profileId: string, fixCommonIssues: boolean) =>
        context.api.store?.dispatch(actionsSettings.setFixCommonIssues(profileId, fixCommonIssues)),
      onSetBetaSorting: (profileId: string, betaSorting: boolean) =>
        context.api.store?.dispatch(actionsSettings.setBetaSorting(profileId, betaSorting)),
    }),
    /*visible?:*/ () => {
      return selectors.activeGameId(context.api.getState()) === GAME_ID;
    },
    /*priority?:*/ 51
  );

  context.registerGame(new BannerlordGame(context.api));

  if (hasContextWithCollectionFeature(context)) {
    context.optional.registerCollectionFeature(
      /*id:*/ `${GAME_ID}_load_order`,
      /*generate:*/ (gameId: string, includedMods: string[], _mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return Promise.resolve({});
        }
        return Promise.resolve(genCollectionGeneralData(context.api, includedMods));
      },
      /*parse:*/ async (gameId: string, collection: ICollectionData, _mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return;
        }

        if (hasLegacyData(collection)) {
          parseCollectionLegacyData(context.api, collection);
        }

        if (hasGeneralData(collection)) {
          await parseCollectionGeneralData(context.api, collection);
        }
      },
      /*clone:*/
      (gameId: string, collection: ICollectionData, from: types.IMod, to: types.IMod) => {
        if (GAME_ID !== gameId) {
          return Promise.resolve();
        }
        if (!hasGeneralData(collection)) {
          return Promise.resolve();
        }
        cloneCollectionGeneralData(context.api, gameId, collection, from, to);
        return Promise.resolve();
      },
      /*title:*/ (t: TFunction) => {
        return t(`Requirements & Load Order`);
      },
      /*condition?:*/ (_state: types.IState, gameId: string) => {
        return gameId === GAME_ID;
      },
      /*editComponent?:*/ BannerlordGeneralDataPage
    );

    context.optional.registerCollectionFeature(
      /*id:*/ `${GAME_ID}_mod_options`,
      /*generate:*/ (gameId: string, _includedMods: string[], mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return Promise.resolve({});
        }
        genCollectionModOptionsData(context.api, mod);
        return Promise.resolve({});
      },
      /*parse:*/ async (gameId: string, collection: ICollectionData, mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return;
        }
        if (!hasModOptionsData(collection)) {
          return;
        }
        await parseCollectionModOptionsData(context.api, collection, mod);
      },
      /*clone:*/ async (gameId: string, collection: ICollectionData, from: types.IMod, to: types.IMod) => {
        if (GAME_ID !== gameId) {
          return;
        }
        if (!hasModOptionsData(collection)) {
          return;
        }
        await cloneCollectionModOptionsData(context.api, gameId, collection, from, to);
      },
      /*title:*/ (t: TFunction) => {
        return t(`Mod Options`);
      },
      /*condition?:*/ (_state: types.IState, gameId: string) => {
        return gameId === GAME_ID;
      },
      /*editComponent?:*/ ModOptionsDataPage
    );
  }

  context.registerLoadOrder(/*gameInfo:*/ LoadOrderManager.getInstance(context.api));

  context.registerMainPage(
    /*icon:*/ 'savegame',
    /*title:*/ 'Saves',
    /*element:*/ SavePage,
    /*options:*/ new SavePageOptions(context)
  );

  context.registerInstaller(
    /*id:*/ 'bannerlord-blse-installer',
    /*priority:*/ 30,
    /*testSupported:*/ toBluebird(testBLSE),
    /*install:*/ toBluebird((files: string[]) => installBLSE(context.api, files))
  );
  context.registerModType(
    /*id:*/ 'bannerlord-blse',
    /*priority:*/ 30,
    /*isSupported:*/ (gameId) => gameId === GAME_ID,
    /*getPath:*/ (game) => getInstallPathBLSE(context.api, game),
    /*test:*/ toBluebird(isModTypeBLSE)
  );

  context.registerInstaller(
    /*id:*/ `bannerlord-module-installer`,
    /*priority:*/ 25,
    /*testSupported:*/ toBluebird((files: string[], gameId: string) => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      return launcherManager.testModule(files, gameId);
    }),
    /*install:*/ toBluebird((files: string[], destinationPath: string) => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      return launcherManager.installModule(files, destinationPath);
    })
  );
  context.registerModType(
    /*id:*/ 'bannerlord-module',
    /*priority:*/ 25,
    /*isSupported:*/ (gameId) => gameId === GAME_ID,
    /*getPath:*/ (game) => getInstallPathModule(context.api, game),
    /*test:*/ toBluebird(isModTypeModule)
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 200,
    /*iconOrComponent:*/ `loot-sort`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Auto Sort`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      launcherManager.autoSort();
    },
    /*condition?:*/ (_instanceIds?: string[]): boolean => {
      const state = context.api.getState();
      const gameId: string | undefined = selectors.activeGameId(state);
      return gameId === GAME_ID;
    }
  );

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
    (_instanceIds?: string[]): boolean => {
      const state = context.api.getState();
      const gameId: string | undefined = selectors.activeGameId(state);
      return gameId === GAME_ID;
    }
  );
  */

  // Register Callbacks
  context.once(() => {
    context.api.setStylesheet('savegame', path.join(__dirname, 'savegame.scss'));

    context.api.events.on('gamemode-activated', async (gameId: string) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await gamemodeActivatedLoadOrder(context.api);
      gamemodeActivatedSave(context.api);
    });

    context.api.onAsync(`added-files`, async (profileId: string, files: IAddedFiles[]) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await addedFilesEvent(context.api, files);
    });

    // TODO: listen to profile switch events and check for BLSE
    context.api.onAsync('did-deploy', async (profileId: string) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await didDeployLoadOrder(context.api);
      didDeployBLSE(context.api);
    });

    context.api.onAsync('did-purge', (profileId: string) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return Promise.resolve();
      }

      didPurgeBLSE(context.api);
      return Promise.resolve();
    });

    context.api.onAsync('will-remove-mod', async (gameId: string, modId: string) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await willRemoveModCollections(context.api, modId);
    });
  });
  // Register Callbacks

  return true;
};

export default main;

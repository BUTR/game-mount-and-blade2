// eslint-disable-next-line no-restricted-imports
import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { selectors, types, log } from 'vortex-api';
import { GAME_ID } from './common';
import { BannerlordGame } from './game';
import {
  LoadOrderManager,
  VortexLauncherManager,
  getInstallPathModule,
  isModTypeModule,
  isModTypeBLSE,
  getInstallPathBLSE,
  testBLSE,
  installBLSE,
  didPurgeEvent,
  didDeployEvent,
  addedFiles,
  SaveManager,
  reducer,
  actionsSettings,
  LocalizationManager,
} from './utils';
import { SaveList, SavePageOptions, Settings } from './views';
import { IAddedFiles } from './types';
import { version } from '../package.json';
import { ISettingsProps } from './views/Settings/Settings';

const main = (context: types.IExtensionContext): boolean => {
  log('info', `Extension Version: ${version}`);

  const getLocalizationManager = () => {
    return LocalizationManager.getInstance(context.api);
  };
  const getLauncherManager = () => {
    return VortexLauncherManager.getInstance(context.api, getLocalizationManager);
  };
  const getLoadOrderManager = () => {
    return LoadOrderManager.getInstance(context.api, getLauncherManager, getLocalizationManager);
  };
  const getSaveManager = () => {
    return SaveManager.getInstance(context.api, getLauncherManager);
  };

  context.registerReducer(/*path:*/ [`settings`, GAME_ID], /*spec:*/ reducer);

  context.registerSettings(
    /*title:*/ `Interface`,
    /*element:*/ Settings,
    /*props?:*/ (): ISettingsProps => ({
      getLocalizationManager: getLocalizationManager,
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

  context.registerGame(new BannerlordGame(context.api, getLauncherManager, getLocalizationManager));

  /*
  // Register Collection Feature
  const collectionFeature: IExtensionContextCollectionFeature = context.optional;
  if (collectionFeature.registerCollectionFeature) {
    collectionFeature.registerCollectionFeature(
      `mountandblade2_collection_data`,
      (gameId: string, includedMods: string[]) => genCollectionsData(context, gameId, includedMods),
      (gameId: string, collection: ICollection) => parseCollectionsData(context, gameId, collection as ICollectionMB),
      () => Promise.resolve(),
      (t: TFunction) => t(`Mount and Blade 2 Data`),
      (_state: types.IState, gameId: string) => gameId === GAME_ID,
      CollectionsDataView as React.ComponentType<IExtendedInterfaceProps>,
    );
  }
  */

  context.registerLoadOrder(/*gameInfo:*/ getLoadOrderManager());

  context.registerMainPage(
    /*icon:*/ 'savegame',
    /*title:*/ 'Saves',
    /*element:*/ SaveList,
    /*options:*/ new SavePageOptions(context, getLauncherManager, getSaveManager, getLocalizationManager)
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
    /*testSupported:*/ toBluebird(async (files: string[], gameId: string) => {
      const launcherManager = getLauncherManager();
      return await launcherManager.testModule(files, gameId);
    }),
    /*install:*/ toBluebird(async (files: string[], destinationPath: string) => {
      const launcherManager = getLauncherManager();
      return await launcherManager.installModule(files, destinationPath);
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
      const launcherManager = getLauncherManager();
      launcherManager.autoSort();
    },
    /*condition?:*/ (_instanceIds?: string[]): boolean => {
      const state = context.api.getState();
      const gameId = selectors.activeGameId(state);
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
      const loadOrderManager = getLoadOrderManager();
      loadOrderManager.updateCompatibilityScores();
    },
    (_instanceIds?: string[]): boolean => {
      const state = context.api.getState();
      const gameId = selectors.activeGameId(state);
      return gameId === GAME_ID;
    }
  );
  */

  // Register Callbacks
  context.once(
    toBluebird<void>(async () => {
      context.api.setStylesheet('savegame', path.join(__dirname, 'savegame.scss'));

      context.api.events.on('gamemode-activated', async (gameId: string) => {
        if (GAME_ID !== gameId) {
          return;
        }
        try {
          const loadOrderManager = getLoadOrderManager();
          await loadOrderManager.deserializeLoadOrder();
        } catch (err) {
          context.api.showErrorNotification?.('Failed to deserialize load order file', err);
          return;
        }
        try {
          const saveManager = getSaveManager();
          saveManager.reloadSave();
        } catch (err) {
          context.api.showErrorNotification?.('Failed to reload the currect save file', err);
          return;
        }
      });

      /*
      // TODO: Provide compatibility info for Game Version -> Mod Version from the BUTR Site
      const proxy = new ModAnalyzerProxy(context.api);
      context.api.addMetaServer(`butr.link`, {
        url: '',
        loopbackCB: (query: types.IQuery) =>
          Bluebird.resolve(proxy.find(query)).catch((err) => {
            log('error', 'failed to look up butr meta info', err.message);
            return Bluebird.resolve([]);
          }),
        cacheDurationSec: 86400,
        priority: 25,
      });
      */

      context.api.onAsync(`added-files`, (profileId: string, files: IAddedFiles[]) =>
        addedFiles(context.api, profileId, files)
      );

      // TODO: lister to profile switch events and check for BLSE
      // Set BLSE CLI as primary tool on deployment if no primary tool is set
      context.api.onAsync('did-deploy', (profileId: string) =>
        didDeployEvent(context.api, profileId, getLocalizationManager, getLoadOrderManager)
      );
      // Remove BLSE CLI as primary tool on purge if it is set
      context.api.onAsync('did-purge', (profileId: string) => didPurgeEvent(context.api, profileId));
    })
  );
  // Register Callbacks

  return true;
};

export default main;

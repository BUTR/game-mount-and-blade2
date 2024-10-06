// eslint-disable-next-line no-restricted-imports
import Bluebird, { method as toBluebird } from 'bluebird';
import { log, selectors, types, util } from 'vortex-api';
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
import { IAddedFiles, IBannerlordModStorage } from './types';
import { reducerSession, reducerSettings, reducersPersistence } from './react';
import { actionsSettings } from './settings';
import {
  cloneCollectionGeneralData,
  cloneCollectionModOptionsData,
  didDeployCollection,
  genCollectionGeneralData,
  genCollectionModOptionsData,
  hasContextWithCollectionFeature,
  ICollectionData,
  modDisabledCollections,
  parseCollectionGeneralData,
  parseCollectionLegacyData,
  parseCollectionModOptionsData,
} from './collections';
import { didDeployLoadOrder, gamemodeActivatedLoadOrder, LoadOrderManager, toggleLoadOrder } from './loadOrder';
import { didDeployBLSE, didPurgeBLSE, getInstallPathBLSE, installBLSE, isModTypeBLSE, testBLSE } from './blse';
import { VortexLauncherManager } from './launcher';
import { gamemodeActivatedSave } from './save';
import {
  addedFilesEvent,
  getInstallPathModule,
  hasPersistentBannerlordMods,
  hasPersistentLoadOrder,
  installedMod,
  isModTypeModule,
} from './vortex';
import { nameof as nameof2 } from './nameof';
import { version } from '../package.json';

// TODO: Better dialogs with settings

const main = (context: types.IExtensionContext): boolean => {
  log('info', `Extension Version: ${version}`);

  const nameof = nameof2<types.IState>;
  context.registerReducer(/*path:*/ [nameof('persistent'), GAME_ID], /*spec:*/ reducersPersistence);
  context.registerReducer(/*path:*/ [nameof('settings'), GAME_ID], /*spec:*/ reducerSettings);
  context.registerReducer(/*path:*/ [nameof('session'), GAME_ID], /*spec:*/ reducerSession);

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
      /*generate:*/ async (gameId: string, includedModIds: string[], _mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return {};
        }

        const state = context.api.getState();
        const profile: types.IProfile | undefined = selectors.activeProfile(state);
        const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile?.id] ?? [] : [];
        const mods = hasPersistentBannerlordMods(state.persistent)
          ? state.persistent.mods.mountandblade2bannerlord
          : {};

        const includedMods = Object.values(mods)
          .filter((mod) => includedModIds.includes(mod.id))
          .reduce<IBannerlordModStorage>((map, obj) => {
            map[obj.id] = obj;
            return map;
          }, {});

        return await genCollectionGeneralData(profile, loadOrder, includedMods);
      },
      /*parse:*/ async (gameId: string, collection: ICollectionData, mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return;
        }

        await parseCollectionLegacyData(context.api, collection, mod);
        await parseCollectionGeneralData(context.api, collection, mod);
      },
      /*clone:*/
      async (gameId: string, collection: ICollectionData, from: types.IMod, to: types.IMod) => {
        if (GAME_ID !== gameId) {
          return;
        }
        await cloneCollectionGeneralData(context.api, gameId, collection, from, to);
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
      /*generate:*/ async (gameId: string, _includedMods: string[], mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return {};
        }
        return await genCollectionModOptionsData(context.api, mod);
      },
      /*parse:*/ async (gameId: string, collection: ICollectionData, mod: types.IMod) => {
        if (GAME_ID !== gameId) {
          return;
        }

        await parseCollectionModOptionsData(context.api, collection, mod);
      },
      /*clone:*/ async (gameId: string, collection: ICollectionData, from: types.IMod, to: types.IMod) => {
        if (GAME_ID !== gameId) {
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
    /*install:*/ toBluebird(
      (
        files: string[],
        destinationPath: string,
        _gameId: string,
        _progressDelegate: types.ProgressDelegate,
        _choices?: unknown,
        _unattended?: boolean,
        archivePath?: string
      ) => {
        const launcherManager = VortexLauncherManager.getInstance(context.api);
        return launcherManager.installModule(files, destinationPath, archivePath);
      }
    )
  );
  context.registerModType(
    /*id:*/ 'bannerlord-module',
    /*priority:*/ 25,
    /*isSupported:*/ (gameId) => gameId === GAME_ID,
    /*getPath:*/ (game) => getInstallPathModule(context.api, game),
    /*test:*/ toBluebird(isModTypeModule)
  );

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
      launcherManager.autoSort();
    },
    /*condition?:*/ isMB2
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 210,
    /*iconOrComponent:*/ `checkbox-checked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Enable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      toggleLoadOrder(context.api, true);
    },
    /*condition?:*/ isMB2
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 215,
    /*iconOrComponent:*/ `checkbox-unchecked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Disable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      toggleLoadOrder(context.api, false);
    },
    /*condition?:*/ isMB2
  );

  // Import from Novus
  // Import from LaunhcerEx
  // Export to LaunhcerEx

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

  // Register Callbacks
  context.once(() => {
    context.api.setStylesheet('savegame', path.join(__dirname, 'savegame.scss'));

    context.api.events.on('gamemode-activated', async (gameId: string) => {
      if (GAME_ID !== gameId) {
        return;
      }

      await gamemodeActivatedLoadOrder(context.api);
      await gamemodeActivatedSave(context.api);
    });

    context.api.events.on('did-install-mod', (gameId: string, archiveId: string, modId: string): void => {
      if (GAME_ID !== gameId) {
        return;
      }

      installedMod(context.api, archiveId, modId);
    });

    context.api.onAsync(`added-files`, async (profileId: string, files: IAddedFiles[]) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await addedFilesEvent(context.api, files);
    });

    // TODO: The idea is that we can get the list of enabled/disabled
    // Collections and perform LO import or mod settings changes
    // The current implementation doesn't understand if the new deployment added or removed mods
    // So it will just reapply the LO and mod settings for deployed previously collections
    let preDeploymentCollections: types.IMod[] | undefined = undefined;
    context.api.onAsync('will-deploy', async (profileId: string, dep: types.IDeploymentManifest): Promise<void> => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }
      preDeploymentCollections = Object.values(state.persistent.mods[GAME_ID] || {}).filter(
        (x) => x.type === 'collection'
      );
      await Promise.resolve();
    });
    context.api.onAsync(
      'bake-settings',
      async (gameId: string, sortedModList: types.IMod[], profile: types.IProfile): Promise<void> => {
        if (profile.gameId !== GAME_ID) {
          return;
        }

        const state = context.api.getState();
        const oldCollections = preDeploymentCollections ?? [];
        const collections = sortedModList.filter((x) => x.type === 'collection');
        const newCollections = Object.values(state.persistent.mods[GAME_ID] || {}).filter(
          (x) => x.type === 'collection'
        );
        const addedMods = collections.filter((mod) => !oldCollections?.some((oldMod) => oldMod.id === mod.id));
        const removedMods = oldCollections.filter((mod) => !collections.some((newMod) => newMod.id === mod.id));
        preDeploymentCollections = undefined;
        await Promise.resolve();
      }
    );

    // TODO: listen to profile switch events and check for BLSE
    context.api.onAsync('did-deploy', async (profileId: string) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await didDeployLoadOrder(context.api);
      await didDeployBLSE(context.api);
      await didDeployCollection(context.api, profileId);
    });

    context.api.onAsync('did-purge', async (profileId: string) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await didPurgeBLSE(context.api);
    });

    context.api.events.on('mod-disabled', async (profileId: string, modId: string) => {
      const state = context.api.getState();
      const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
      if (profile?.gameId !== GAME_ID) {
        return;
      }

      await modDisabledCollections(context.api, modId);
    });
  });
  // Register Callbacks

  return true;
};

export default main;

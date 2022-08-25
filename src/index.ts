import { Promise as Bluebird } from 'bluebird';

import * as React from 'react';
import * as BS from 'react-bootstrap';

import { BannerlordModuleManager } from '@butr/blmodulemanagernative/dist/module/lib';

import getVersion from 'exe-version';

import path from 'path';
import semver from 'semver';
import { actions, FlexLayout, fs, log, selectors, types, util } from 'vortex-api';
import { getXMLData, refreshGameParams } from './util';

import {
  BANNERLORD_EXEC, GAME_ID, I18N_NAMESPACE,
  MODULES
} from './common';
import CustomItemRenderer from './views/CustomItemRenderer';

import { genCollectionsData, parseCollectionsData } from './collections/collections';
import { ICollectionsData } from './collections/types';
import { getCache, refreshCache } from './subModCache';
import { ILoadOrder, IModuleCache, IModuleInfoExtendedExt, ISortProps } from './types';
import CollectionsDataView from './views/CollectionsDataView';
import { migrate026, migrate045 } from './migrations';
import { testRootMod, installRootMod } from './installers/rootmod';
import { testForSubmodules, installSubModules } from './installers/submodules';
import LoadOrderInfo from './views/LoadOrderInfo';

import { createAction } from 'redux-act';

import Settings from './views/Settings';

const LAUNCHER_EXEC = path.join('bin', 'Win64_Shipping_Client', 'TaleWorlds.MountAndBlade.Launcher.exe');
const MODDING_KIT_EXEC = path.join('bin', 'Win64_Shipping_wEditor', 'TaleWorlds.MountAndBlade.Launcher.exe');

let STORE_ID;

const GOG_IDS = ['1802539526', '1564781494'];
const STEAMAPP_ID = 261550;
const EPICAPP_ID = 'Chickadee';

const setSortOnDeploy = createAction('MNB2_SET_SORT_ON_DEPLOY',
  (profileId: string, sort: boolean) => ({ profileId, sort }));
const reducer: types.IReducerSpec = {
  reducers: {
    [setSortOnDeploy as any]: (state, payload) =>
      util.setSafe(state, ['sortOnDeploy', payload.profileId], payload.sort),
  },
  defaults: {
    sortOnDeploy: {},
  },
};

function findGame() {
  return util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS])
    .then(game => {
      STORE_ID = game.gameStoreId;
      return Promise.resolve(game.gamePath);
    });
}

function ensureOfficialLauncher(context, discovery) {
  context.api.store.dispatch(actions.addDiscoveredTool(GAME_ID, 'TaleWorldsBannerlordLauncher', {
    id: 'TaleWorldsBannerlordLauncher',
    name: 'Official Launcher',
    logo: 'twlauncher.png',
    executable: () => path.basename(LAUNCHER_EXEC),
    requiredFiles: [
      path.basename(LAUNCHER_EXEC),
    ],
    path: path.join(discovery.path, LAUNCHER_EXEC),
    relative: true,
    workingDirectory: path.join(discovery.path, 'bin', 'Win64_Shipping_Client'),
    hidden: false,
    custom: false,
  }, false));
}

function setModdingTool(context: types.IExtensionContext,
                        discovery: types.IDiscoveryResult,
                        hidden?: boolean) {
  const toolId = 'bannerlord-sdk';
  const exec = path.basename(MODDING_KIT_EXEC);
  const tool = {
    id: toolId,
    name: 'Modding Kit',
    logo: 'twlauncher.png',
    executable: () => exec,
    requiredFiles: [ exec ],
    path: path.join(discovery.path, MODDING_KIT_EXEC),
    relative: true,
    exclusive: true,
    workingDirectory: path.join(discovery.path, path.dirname(MODDING_KIT_EXEC)),
    hidden,
    custom: false,
  };

  context.api.store.dispatch(actions.addDiscoveredTool(GAME_ID, toolId, tool, false));
}

async function prepareForModding(context, discovery, bmm: BannerlordModuleManager) {
  if (bmm === undefined) {
    bmm = await BannerlordModuleManager.createAsync();
  }
  // Quickly ensure that the official Launcher is added.
  ensureOfficialLauncher(context, discovery);
  try {
    await fs.statAsync(path.join(discovery.path, MODDING_KIT_EXEC));
    setModdingTool(context, discovery);
  } catch (err) {
    const tools = discovery?.tools;
    if ((tools !== undefined)
    && (util.getSafe(tools, ['bannerlord-sdk'], undefined) !== undefined)) {
      setModdingTool(context, discovery, true);
    }
  }

  // If game store not found, location may be set manually - allow setup
  //  function to continue.
  const findStoreId = () => findGame().catch(err => Promise.resolve());
  const startSteam = () => findStoreId()
    .then(() => (STORE_ID === 'steam')
      ? util.GameStoreHelper.launchGameStore(context.api, STORE_ID, undefined, true)
      : Promise.resolve());

  // Check if we've already set the load order object for this profile
  //  and create it if we haven't.
  return startSteam().then(async () => {
    try {
      await refreshCache(context, bmm);
    } catch (err) {
      return Promise.reject(err);
    }
  })
  .finally(() => {
    const state = context.api.store.getState();
    const activeProfile = selectors.activeProfile(state);
    if (activeProfile === undefined) {
      // Valid use case when attempting to switch to
      //  Bannerlord without any active profile.
      return refreshGameParams(context, {});
    }
    const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', activeProfile.id], {});
    return refreshGameParams(context, loadOrder);
  });
}

function tSort(sortProps: ISortProps) {
  const { bmm } = sortProps;
  const CACHE: IModuleCache = getCache();
  const sorted = bmm.sort(Object.values(CACHE));
  return sorted;
}

function isExternal(context, subModId) {
  const state = context.api.getState();
  const mods = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  const modIds = Object.keys(mods);
  modIds.forEach(modId => {
    const subModIds = util.getSafe(mods[modId], ['attributes', 'subModIds'], []);
    if (subModIds.includes(subModId)) {
      return false;
    }
  });
  return true;
}

let refreshFunc;
async function refreshCacheOnEvent(context: types.IExtensionContext,
                                   profileId: string,
                                   bmm: BannerlordModuleManager) {
  if (profileId === undefined) {
    return Promise.resolve();
  }

  const state = context.api.store.getState();
  const activeProfile = selectors.activeProfile(state);
  const deployProfile = selectors.profileById(state, profileId);
  if ((activeProfile?.gameId !== deployProfile?.gameId) || (activeProfile?.gameId !== GAME_ID)) {
    // Deployment event seems to be executed for a profile other
    //  than the currently active one. Not going to continue.
    return Promise.resolve();
  }
  try {
    await refreshCache(context, bmm);
  } catch (err) {
    // ProcessCanceled means that we were unable to scan for deployed
    //  subModules, probably because game discovery is incomplete.
    // It's beyond the scope of this function to report discovery
    //  related issues.
    return (err instanceof util.ProcessCanceled)
      ? Promise.resolve()
      : Promise.reject(err);
  }

  const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', profileId], {});

  if (util.getSafe(state, ['settings', 'mountandblade2', 'sortOnDeploy', activeProfile.id], true)) {
    return sortImpl(context, bmm);
  } else {
    if (refreshFunc !== undefined) {
      refreshFunc();
    }
    return refreshGameParams(context, loadOrder);
  }
}

async function preSort(context, items, direction, updateType, bmm) {
  const state = context.api.store.getState();
  const activeProfile = selectors.activeProfile(state);
  if (activeProfile?.id === undefined || activeProfile?.gameId !== GAME_ID) {
    // Race condition ?
    return Promise.resolve(items);
  }
  const CACHE = getCache();
  if (Object.keys(CACHE).length !== items.length) {
    const displayItems = Object.values(CACHE).map(iter => ({
      id: iter.id,
      name: iter.name,
      imgUrl: `${__dirname}/gameart.jpg`,
      external: isExternal(context, iter.id),
      official: iter.isOfficial,
    }));
    return Promise.resolve(displayItems);
  } else {
    let ordered = [];
    if (updateType !== 'drag-n-drop') {
      const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', activeProfile.id], {});
      ordered = items.filter(item => loadOrder[item.id] !== undefined)
                          .sort((lhs, rhs) => loadOrder[lhs.id].pos - loadOrder[rhs.id].pos);
      const unOrdered = items.filter(item => loadOrder[item.id] === undefined);
      ordered = [].concat(ordered, unOrdered);
    } else {
      ordered = items;
    }
    return Promise.resolve(ordered);
  }
}

async function resolveGameVersion(discoveryPath: string) {
  if (process.env.NODE_ENV !== 'development' && semver.satisfies(util.getApplication().version, '<1.4.0')) {
    return Promise.reject(new util.ProcessCanceled('not supported in older Vortex versions'));
  }
  try {
    const data = await getXMLData(path.join(discoveryPath, 'bin', 'Win64_Shipping_Client', 'Version.xml'));
    const exePath = path.join(discoveryPath, BANNERLORD_EXEC);
    const value = data?.Version?.Singleplayer?.[0]?.$?.Value
      .slice(1)
      .split('.')
      .slice(0, 3)
      .join('.');
    return (semver.valid(value)) ? Promise.resolve(value) : getVersion(exePath);
  } catch (err) {
    return Promise.reject(err);
  }
}

let _IS_SORTING = false;
async function sortImpl(context: types.IExtensionContext, bmm: BannerlordModuleManager) {
  const state = context.api.store.getState();
  const activeProfile = selectors.activeProfile(state);
  if (activeProfile?.id === undefined) {
    // Probably best that we don't report this via notification as a number
    //  of things may have occurred that caused this issue. We log it instead.
    log('error', 'Failed to sort mods', { reason: 'No active profile' });
    _IS_SORTING = false;
    return;
  }

  const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', activeProfile.id], {});

  let sorted: IModuleInfoExtendedExt[];
  try {
    await refreshCache(context, bmm);
    sorted = tSort({ loadOrder, bmm });
  } catch (err) {
    context.api.showErrorNotification('Failed to sort mods', err);
    return;
  }

  const newOrder: ILoadOrder = sorted.reduce((accum: ILoadOrder,
                                              mod: IModuleInfoExtendedExt,
                                              idx: number) => {
    if (mod === undefined) {
      return accum;
    }
    accum[mod.vortexId || mod.id] = {
      pos: idx,
      enabled: loadOrder[mod.vortexId || mod.id]?.enabled || true,
      external: isExternal(context, mod.id),
      data: mod,
    };
    return accum;
  }, {});

  context.api.store.dispatch(actions.setLoadOrder(activeProfile.id, newOrder as any));
  return refreshGameParams(context, newOrder)
    .then(() => context.api.sendNotification({
      id: 'mnb2-sort-finished',
      type: 'info',
      message: context.api.translate('Finished sorting', { ns: I18N_NAMESPACE }),
      displayMS: 3000,
    })).finally(() => _IS_SORTING = false);
}

function main(context: types.IExtensionContext) {
  context.registerReducer(['settings', 'mountandblade2'], reducer);
  let bmm: BannerlordModuleManager;
  (context.registerSettings as any)('Interface', Settings, () => ({
    t: context.api.translate,
    onSetSortOnDeploy: (profileId: string, sort: boolean) =>
      context.api.store.dispatch(setSortOnDeploy(profileId, sort)),
  }), () => {
    const state = context.api.getState();
    const profile = selectors.activeProfile(state);
    return profile !== undefined && profile?.gameId === GAME_ID;
  }, 51);

  context.registerGame({
    id: GAME_ID,
    name: 'Mount & Blade II:\tBannerlord',
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => '.',
    getGameVersion: resolveGameVersion,
    logo: 'gameart.jpg',
    executable: () => BANNERLORD_EXEC,
    setup: (discovery) => prepareForModding(context, discovery, bmm),
    requiredFiles: [
      BANNERLORD_EXEC,
    ],
    parameters: [],
    requiresCleanup: true,
    environment: {
      SteamAPPId: STEAMAPP_ID.toString(),
    },
    details: {
      steamAppId: STEAMAPP_ID,
      epicAppId: EPICAPP_ID,
      customOpenModsPath: MODULES,
    },
  });

  context.optional.registerCollectionFeature(
    'mountandblade2_collection_data',
    (gameId: string, includedMods: string[]) =>
      genCollectionsData(context, gameId, includedMods),
    (gameId: string, collection: ICollectionsData) =>
      parseCollectionsData(context, gameId, collection),
    () => Promise.resolve(),
    (t) => t('Mount and Blade 2 Data'),
    (state: types.IState, gameId: string) => gameId === GAME_ID,
    CollectionsDataView,
  );

  // Register the LO page.
  context.registerLoadOrderPage({
    gameId: GAME_ID,
    //Cast as any because this is strictly typed to React.ComponentClass but accepts a function component.
    createInfoPanel: (props) => React.createElement(LoadOrderInfo, {
      ...props,
    }), 
    noCollectionGeneration: true,
    gameArtURL: `${__dirname}/gameart.jpg`,
    preSort: (items, direction, updateType) =>
      preSort(context, items, direction, updateType, bmm),
    callback: (loadOrder) => refreshGameParams(context, loadOrder),
    itemRenderer: (props) => React.createElement(CustomItemRenderer, {
      ...props,
      moduleManager: bmm,
    }),
  });

  context.registerInstaller('bannerlordrootmod', 20, testRootMod, installRootMod);

  // Installs one or more submodules.
  context.registerInstaller('bannerlordsubmodules', 25, testForSubmodules, installSubModules);

  // A very simple migration that intends to add the subModIds attribute
  //  to mods that act as "mod packs". This migration is non-invasive and will
  //  not report any errors. Side effects of the migration not working correctly
  //  will not affect the user's existing environment.
  context.registerMigration(old => migrate026(context.api, old));
  context.registerMigration(old => migrate045(context.api, old));

  context.registerAction('generic-load-order-icons', 200,
    _IS_SORTING ? 'spinner' : 'loot-sort', {}, 'Auto Sort', () => {
      sortImpl(context, bmm);
  }, () => {
    const state = context.api.store.getState();
    const gameId = selectors.activeGameId(state);
    return (gameId === GAME_ID);
  });

  context.once(async () => {
    bmm = await BannerlordModuleManager.createAsync();
    context.api.onAsync('did-deploy', async (profileId, deployment) =>
      refreshCacheOnEvent(context, profileId, bmm));

    context.api.onAsync('did-purge', async (profileId) =>
      refreshCacheOnEvent(context, profileId, bmm));

    context.api.events.on('gamemode-activated', (gameMode) => {
      const state = context.api.getState();
      const prof = selectors.activeProfile(state);
      refreshCacheOnEvent(context, prof?.id, bmm);
    });

    context.api.onAsync('added-files', async (profileId, files) => {
      const state = context.api.store.getState();
      const profile = selectors.profileById(state, profileId);
        // don't care about any other games - or if the profile is no longer valid.
      if (profile.gameId !== GAME_ID) {
        return;
      }
      const game = util.getGame(GAME_ID);
      const discovery = selectors.discoveryByGame(state, GAME_ID);
      const modPaths = game.getModPaths(discovery.path);
      const installPath = selectors.installPathForGame(state, GAME_ID);

      await Bluebird.map(files, async (entry: { filePath: string, candidates: string[] }) => {
        // only act if we definitively know which mod owns the file
        if (entry.candidates.length === 1) {
          const mod = util.getSafe(state.persistent.mods,
            [GAME_ID, entry.candidates[0]], undefined);
          if (mod === undefined) {
            return Promise.resolve();
          }
          const relPath = path.relative(modPaths[mod.type ?? ''], entry.filePath);
          const targetPath = path.join(installPath, mod.id, relPath);
          // copy the new file back into the corresponding mod, then delete it.
          //  That way, vortex will create a link to it with the correct
          //  deployment method and not ask the user any questions
          await fs.ensureDirAsync(path.dirname(targetPath));

          // Remove the target destination file if it exists.
          //  this is to completely avoid a scenario where we may attempt to
          //  copy the same file onto itself.
          return fs.removeAsync(targetPath)
            .catch(err => (err.code === 'ENOENT')
              ? Promise.resolve()
              : Promise.reject(err))
            .then(() => fs.copyAsync(entry.filePath, targetPath))
            .then(() => fs.removeAsync(entry.filePath))
            .catch(err => log('error', 'failed to import added file to mod', err.message));
        }
      });
    });
  });

  return true;
}

module.exports = {
  default: main,
};

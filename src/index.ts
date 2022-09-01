/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import * as React from 'react';
import { createAction } from 'redux-act';

import path from 'path';
import semver from 'semver';
import getVersion from 'exe-version';
import {
  actions, fs, log, selectors, types, util,
} from 'vortex-api';
import {
  IDiscoveryResult, IExtensionContext, ILoadOrderDisplayItem, IMod, IReducerSpec, TFunction, UpdateType,
} from 'vortex-api/lib/types/api';
import { IInfoPanelProps } from 'vortex-api/lib/extensions/mod_load_order/types/types';

import { IExtendedInterfaceProps } from "collections/src/types/IExtendedInterfaceProps";
import { ICollection } from 'collections/src/types/ICollection';

import {
  BANNERLORD_EXEC, GAME_ID, I18N_NAMESPACE,
  MODULES,
} from './common';

import { ICollectionMB, IExtensionContextCollectionFeature } from "./collections/types";

import CustomItemRenderer from './views/CustomItemRenderer';
import LoadOrderInfo from './views/LoadOrderInfo';
import CollectionsDataView from './views/CollectionsDataView';
import Settings from './views/Settings';

import { genCollectionsData, parseCollectionsData } from './collections/collections';
import { getCache, refreshCache } from './utils/subModCache';
import { getXMLData, refreshGameParams } from './utils/util';
import {
  ILoadOrder, IMods, IModuleCache, IModuleInfoExtendedExt, ISortProps,
} from './types';
import { migrate026, migrate045 } from './utils/migrations';

import { installRootMod } from './installers/rootmodinstaller';
import { testRootMod } from './installers/rootmodtester';
import { installSubModules } from './installers/submoduleinstaller';
import { testForSubmodules } from './installers/submoduletester';
import { createBannerlordModuleManager, BannerlordModuleManager, ModuleInfoExtended } from './utils/bmm';

const LAUNCHER_EXEC = path.join(`bin`, `Win64_Shipping_Client`, `TaleWorlds.MountAndBlade.Launcher.exe`);
const MODDING_KIT_EXEC = path.join(`bin`, `Win64_Shipping_wEditor`, `TaleWorlds.MountAndBlade.Launcher.exe`);

let STORE_ID: string;

const EXTENSION_BASE_ID = `MAB2B`;
const GOG_IDS = [`1802539526`, `1564781494`];
const STEAMAPP_ID = 261550;
const EPICAPP_ID = `Chickadee`;

const setSortOnDeploy = createAction(`${EXTENSION_BASE_ID}_SET_SORT_ON_DEPLOY`, (profileId: string, sort: boolean) => ({ profileId, sort }));

const reducer: IReducerSpec = {
  reducers: {
    [setSortOnDeploy as any]: (state, payload) => util.setSafe(state, [`sortOnDeploy`, payload.profileId], payload.sort),
  },
  defaults: {
    sortOnDeploy: {},
  },
};

const findGame = async (): Promise<string> => {
  const game = await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS]);
  STORE_ID = game.gameStoreId;
  return game.gamePath;
};

const ensureOfficialLauncher = (context: IExtensionContext, discovery: IDiscoveryResult): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  context.api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, `TaleWorldsBannerlordLauncher`, {
    id: `TaleWorldsBannerlordLauncher`,
    name: `Official Launcher`,
    logo: `twlauncher.png`,
    executable: () => path.basename(LAUNCHER_EXEC),
    requiredFiles: [
      path.basename(LAUNCHER_EXEC),
    ],
    path: path.join(discovery.path, LAUNCHER_EXEC),
    relative: true,
    workingDirectory: path.join(discovery.path, `bin`, `Win64_Shipping_Client`),
    hidden: false,
    custom: false,
  }, false));
};

const setModdingTool = (context: IExtensionContext, discovery: IDiscoveryResult, hidden?: boolean): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const toolId = `bannerlord-sdk`;
  const exec = path.basename(MODDING_KIT_EXEC);
  const tool: types.IDiscoveredTool = {
    id: toolId,
    name: `Modding Kit`,
    logo: `twlauncher.png`,
    executable: () => exec,
    requiredFiles: [exec],
    path: path.join(discovery.path, MODDING_KIT_EXEC),
    relative: true,
    exclusive: true,
    workingDirectory: path.join(discovery.path, path.dirname(MODDING_KIT_EXEC)),
    hidden: hidden || false,
    custom: false,
  };

  context.api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, toolId, tool, false));
};

const prepareForModding = async (context: IExtensionContext, discovery: IDiscoveryResult): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const bmm = await createBannerlordModuleManager();
  // Quickly ensure that the official Launcher is added.
  ensureOfficialLauncher(context, discovery);
  try {
    await fs.statAsync(path.join(discovery.path, MODDING_KIT_EXEC));
    setModdingTool(context, discovery);
  } catch (err) {
    const tools = discovery?.tools;
    if (tools !== undefined && util.getSafe<any | undefined>(tools, [`bannerlord-sdk`], undefined) !== undefined) {
      setModdingTool(context, discovery, true);
    }
  }

  // If game store not found, location may be set manually - allow setup
  //  function to continue.
  const findStoreId = (): Promise<string | void> => findGame().catch((_err) => Promise.resolve());
  const startSteam = (): Promise<void> => findStoreId().then(() => ((STORE_ID === `steam`)
    ? util.GameStoreHelper.launchGameStore(context.api, STORE_ID, undefined, true)
    : Promise.resolve()));

  // Check if we've already set the load order object for this profile
  //  and create it if we haven't.
  return startSteam().then(async () => {
    await refreshCache(context, bmm);
  }).finally(() => {
    const state = context.api.store?.getState();
    const activeProfile = selectors.activeProfile(state);
    if (activeProfile === undefined) {
      // Valid use case when attempting to switch to
      //  Bannerlord without any active profile.
      return refreshGameParams(context, {});
    }
    const loadOrder = util.getSafe<ILoadOrder>(state, [`persistent`, `loadOrder`, activeProfile.id], {});
    return refreshGameParams(context, loadOrder);
  });
};

const tSort = (sortProps: ISortProps): ModuleInfoExtended[] => {
  const { bmm } = sortProps;
  const CACHE: IModuleCache = getCache();
  const sorted = bmm.sort(Object.values(CACHE));
  return sorted;
};

const isExternal = (context: IExtensionContext, subModId: string): boolean => {
  const state = context.api.getState();
  const mods = util.getSafe<IMods>(state, [`persistent`, `mods`, GAME_ID], {});
  const modIds = Object.keys(mods);
  for (const modId of modIds) {
    const subModIds = util.getSafe<string[]>(mods[modId], [`attributes`, `subModIds`], []);
    if (subModIds.includes(subModId)) {
      return false;
    }
  }
  return true;
};

let refreshFunc: () => void;
const refreshCacheOnEvent = async (context: IExtensionContext, profileId: string, bmm: BannerlordModuleManager): Promise<void> => {
  if (profileId === undefined) {
    return;
  }

  const state = context.api.store?.getState();
  const activeProfile = selectors.activeProfile(state);
  const deployProfile = selectors.profileById(state, profileId);
  if ((activeProfile?.gameId !== deployProfile?.gameId) || (activeProfile?.gameId !== GAME_ID)) {
    // Deployment event seems to be executed for a profile other
    //  than the currently active one. Not going to continue.
    return;
  }
  try {
    await refreshCache(context, bmm);
  } catch (err) {
    // ProcessCanceled means that we were unable to scan for deployed
    //  subModules, probably because game discovery is incomplete.
    // It's beyond the scope of this function to report discovery
    //  related issues.
    if (!(err instanceof util.ProcessCanceled)) throw err;
  }

  const loadOrder = util.getSafe<ILoadOrder>(state, [`persistent`, `loadOrder`, profileId], {});

  if (util.getSafe<boolean>(state, [`settings`, `mountandblade2`, `sortOnDeploy`, activeProfile.id], true)) {
    await sortImpl(context, bmm);
  }
  if (refreshFunc !== undefined) {
    refreshFunc();
  }
  await refreshGameParams(context, loadOrder);
};

const preSort = toBluebird(async (context: IExtensionContext, items: ILoadOrderDisplayItem[], updateType: UpdateType | undefined): Promise<ILoadOrderDisplayItem[]> => {
  const state = context.api.store?.getState();
  const activeProfile = selectors.activeProfile(state);
  if (activeProfile?.id === undefined || activeProfile?.gameId !== GAME_ID) {
    // Race condition ?
    return items;
  }
  const CACHE = getCache();
  if (Object.keys(CACHE).length !== items.length) {
    const displayItems = Object.values(CACHE).map<ILoadOrderDisplayItem>((iter) => ({
      id: iter.id,
      name: iter.name,
      imgUrl: `${__dirname}/gameart.jpg`,
      external: isExternal(context, iter.id),
      official: iter.isOfficial,
    }));
    return displayItems;
  }
  let ordered = Array<ILoadOrderDisplayItem>();
  if (updateType !== `drag-n-drop`) {
    const loadOrder = util.getSafe<ILoadOrder>(state, [`persistent`, `loadOrder`, activeProfile.id], {});
    ordered = items
      .filter((item) => loadOrder[item.id] !== undefined)
      .sort((lhs, rhs) => loadOrder[lhs.id].pos - loadOrder[rhs.id].pos);
    const unOrdered = items.filter((item) => loadOrder[item.id] === undefined);
    ordered = Array<types.ILoadOrderDisplayItem>().concat(ordered, unOrdered);
  } else {
    ordered = items;
  }
  return ordered;
});

const resolveGameVersion = toBluebird<string, string, string>(async (discoveryPath: string): Promise<string> => {
  if (process.env.NODE_ENV !== `development` && semver.satisfies(util.getApplication().version, `<1.4.0`)) {
    throw new util.ProcessCanceled(`not supported in older Vortex versions`);
  }
  const data = await getXMLData(path.join(discoveryPath, `bin`, `Win64_Shipping_Client`, `Version.xml`));
  const exePath = path.join(discoveryPath, BANNERLORD_EXEC);
  const value = data?.Version?.Singleplayer?.[0]?.$?.Value
    .slice(1)
    .split(`.`)
    .slice(0, 3)
    .join(`.`);
  return (semver.valid(value)) ? value : getVersion(exePath);
});

let IS_SORTING = false;
const sortImpl = async (context: types.IExtensionContext, bmm: BannerlordModuleManager): Promise<void> => {
  const state = context.api.store?.getState();
  const activeProfile = selectors.activeProfile(state);
  if (activeProfile?.id === undefined) {
    // Probably best that we don't report this via notification as a number
    //  of things may have occurred that caused this issue. We log it instead.
    log(`error`, `Failed to sort mods`, { reason: `No active profile` });
    IS_SORTING = false;
    return;
  }

  const loadOrder = util.getSafe<ILoadOrder>(state, [`persistent`, `loadOrder`, activeProfile.id], {});

  let sorted: IModuleInfoExtendedExt[];
  try {
    await refreshCache(context, bmm);
    sorted = tSort({ loadOrder, bmm });
  } catch (err) {
    if (context.api.showErrorNotification) context.api.showErrorNotification(`Failed to sort mods`, err);
    return;
  }

  const newOrder = sorted.reduce((accum: ILoadOrder, mod: IModuleInfoExtendedExt, idx: number) => {
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

  context.api.store?.dispatch(actions.setLoadOrder(activeProfile.id, newOrder as any));

  try {
    await refreshGameParams(context, newOrder);

    context.api.sendNotification?.({
      id: `mnb2-sort-finished`,
      type: `info`,
      message: context.api.translate(`Finished sorting`, { ns: I18N_NAMESPACE }),
      displayMS: 3000,
    });
  } finally {
    IS_SORTING = false;
  }
};

const main = (context: types.IExtensionContext): boolean => {
  context.registerReducer([`settings`, `mountandblade2`], reducer);

  let bmm: BannerlordModuleManager;

  context.registerSettings(`Interface`, Settings, () => ({
    t: context.api.translate,
    onSetSortOnDeploy: (profileId: string, sort: boolean) => context.api.store?.dispatch(setSortOnDeploy(profileId, sort)),
  }), () => {
    const state = context.api.getState();
    const profile = selectors.activeProfile(state);
    return profile !== undefined && profile?.gameId === GAME_ID;
  }, 51);

  context.registerGame({
    id: GAME_ID,
    name: `Mount & Blade II:\tBannerlord BUTR`,
    mergeMods: true,
    queryPath: toBluebird<string>(findGame),
    queryModPath: () => `.`,
    getGameVersion: resolveGameVersion,
    logo: `gameart.jpg`,
    executable: () => BANNERLORD_EXEC,
    setup: toBluebird((discovery: IDiscoveryResult) => prepareForModding(context, discovery)),
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

  // Register the LO page.
  context.registerLoadOrderPage({
    gameId: GAME_ID,
    // Cast as any because this is strictly typed to React.ComponentClass but accepts a function component.
    createInfoPanel: (props: IInfoPanelProps) => React.createElement(LoadOrderInfo, {
      ...props,
    }) as any,
    noCollectionGeneration: true,
    gameArtURL: `${__dirname}/gameart.jpg`,
    preSort: (items, _sortDir, updateType?) => preSort(context, items, updateType) as any,
    callback: (loadOrder) => refreshGameParams(context, loadOrder),
    itemRenderer: ((props: any) => React.createElement(CustomItemRenderer, {
      ...props,
      moduleManager: bmm,
    })) as unknown as React.ComponentClass<{ className?: string; item: ILoadOrderDisplayItem; onRef: (ref: any) => any; }>,
  });

  context.registerInstaller(`bannerlordrootmod`, 20, testRootMod, installRootMod);

  // Installs one or more submodules.
  context.registerInstaller(`bannerlordsubmodules`, 25, testForSubmodules, installSubModules);

  // A very simple migration that intends to add the subModIds attribute
  //  to mods that act as "mod packs". This migration is non-invasive and will
  //  not report any errors. Side effects of the migration not working correctly
  //  will not affect the user's existing environment.
  context.registerMigration((oldVersion: string) => migrate026(context.api, oldVersion));
  context.registerMigration((oldVersion: string) => migrate045(context.api, oldVersion));

  context.registerAction(`generic-load-order-icons`, 200, IS_SORTING ? `spinner` : `loot-sort`, {}, `Auto Sort`, () => { sortImpl(context, bmm); }, () => {
    const state = context.api.store?.getState();
    const gameId = selectors.activeGameId(state);
    return (gameId === GAME_ID);
  });

  context.once(toBluebird<void>(async () => {
    bmm = await createBannerlordModuleManager();

    context.api.onAsync(`did-deploy`, async (profileId, _deployment) => refreshCacheOnEvent(context, profileId, bmm));

    context.api.onAsync(`did-purge`, async (profileId) => refreshCacheOnEvent(context, profileId, bmm));

    context.api.events.on(`gamemode-activated`, (_gameMode) => {
      const state = context.api.getState();
      const prof = selectors.activeProfile(state);
      refreshCacheOnEvent(context, prof?.id, bmm);
    });

    context.api.onAsync(`added-files`, async (profileId, files) => {
      const state = context.api.store?.getState();
      const profile = selectors.profileById(state, profileId);
      // don't care about any other games - or if the profile is no longer valid.
      if (profile.gameId !== GAME_ID) {
        return;
      }
      const game = util.getGame(GAME_ID);
      const discovery = selectors.discoveryByGame(state, GAME_ID);
      const modPaths = game.getModPaths ? game.getModPaths(discovery.path) : { };
      const installPath = selectors.installPathForGame(state, GAME_ID);

      await Promise.map(files, async (entry: { filePath: string, candidates: string[] }) => {
        // only act if we definitively know which mod owns the file
        if (entry.candidates.length === 1) {
          const mod = util.getSafe<IMod | undefined>(state.persistent.mods, [GAME_ID, entry.candidates[0]], undefined);
          if (mod === undefined) {
            return;
          }
          const relPath = path.relative(modPaths[mod.type ?? ``], entry.filePath);
          const targetPath = path.join(installPath, mod.id, relPath);
          // copy the new file back into the corresponding mod, then delete it.
          //  That way, vortex will create a link to it with the correct
          //  deployment method and not ask the user any questions
          await fs.ensureDirAsync(path.dirname(targetPath));

          // Remove the target destination file if it exists.
          //  this is to completely avoid a scenario where we may attempt to
          //  copy the same file onto itself.
          await fs.removeAsync(targetPath);
          try {
            await fs.copyAsync(entry.filePath, targetPath);
            await fs.removeAsync(entry.filePath);
          } catch (err: any) {
            log(`error`, `failed to import added file to mod`, err.message);
          }
        }
      });
    });
  }));

  return true;
};

export default main;

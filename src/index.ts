import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import * as React from 'react';
import path from 'path';
import { createAction } from 'redux-act';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import { createVortexExtensionManager, types as vetypes } from '@butr/vortexextensionnative';
import { LoadOrderItemRenderer } from './views/LoadOrderItemRenderer';
import { LoadOrderInfoPanel } from './views/LoadOrderInfoPanel';
import { Settings } from './views/Settings';
import { findGame, prepareForModding } from './utils/util';
import { registerNativeCallbacks } from './utils/bindingsUtils';
import { preSort } from './utils/loadOrder';
import { BANNERLORD_EXEC, EPICAPP_ID, EXTENSION_BASE_ID, GAME_ID, LAUNCHER_EXEC, MODDING_KIT_EXEC, MODULES, STEAMAPP_ID } from './common';
import { IAddedFiles, IDeployment } from './types';

const setSortOnDeploy = createAction(`${EXTENSION_BASE_ID}_SET_SORT_ON_DEPLOY`, (profileId: string, sort: boolean) => ({ profileId, sort }));

const reducer: types.IReducerSpec = {
    reducers: {
      [setSortOnDeploy as any]: (state, payload) => util.setSafe(state, [`sortOnDeploy`, payload.profileId], payload.sort),
    },
    defaults: {
      sortOnDeploy: {},
    },
};

const manager = createVortexExtensionManager();

const addOfficialLauncher = (context: types.IExtensionContext, discovery: types.IDiscoveryResult): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const launcherId = `TaleWorldsBannerlordLauncher`;
  const exec = path.basename(LAUNCHER_EXEC);
  const tool: types.IDiscoveredTool = {
    id: launcherId,
    name: `Official Launcher`,
    logo: `twlauncher.png`,
    executable: () => exec,
    requiredFiles: [exec],
    path: path.join(discovery.path, LAUNCHER_EXEC),
    relative: true,
    workingDirectory: path.join(discovery.path, `bin`, `Win64_Shipping_Client`),
    hidden: false,
    custom: false,
  };
  context.api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, launcherId, tool, false));
};

const addModdingTool = (context: types.IExtensionContext, discovery: types.IDiscoveryResult, hidden?: boolean): void => {
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

const setup = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: vetypes.VortexExtensionManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);
  
  // Quickly ensure that the official Launcher is added.
  addOfficialLauncher(context, discovery);
  try {
    await fs.statAsync(path.join(discovery.path, MODDING_KIT_EXEC));
    addModdingTool(context, discovery);
  } catch (err) {
    const tools = discovery?.tools;
    if (tools !== undefined && util.getSafe(tools, [`bannerlord-sdk`], undefined) !== undefined) {
      addModdingTool(context, discovery, true);
    }
  }

  await prepareForModding(context, discovery, manager);
}

const main = (context: types.IExtensionContext): boolean => {
  registerNativeCallbacks(context, manager);
  
  // Register reducer
  context.registerReducer([`settings`, `mountandblade2`], reducer);
 
  // Register Settings
  const settingsOnSetSortOnDeploy = (profileId: string, sort: boolean) => context.api.store?.dispatch(setSortOnDeploy(profileId, sort));
  const settingsProps = () => ({ t: context.api.translate, onSetSortOnDeploy: settingsOnSetSortOnDeploy });
  const settingsVisible = () => {
    const state = context.api.getState();
    const profile = selectors.activeProfile(state);
    return profile !== undefined && profile?.gameId === GAME_ID;
  };
  context.registerSettings(`Interface`, Settings, settingsProps, settingsVisible, 51);

  // Register Game
  context.registerGame({
    id: GAME_ID,
    name: `Mount & Blade II:\tBannerlord BUTR`,
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => `.`,
    getGameVersion: (_gamePath, _exePath) => Promise.resolve(manager.getGameVersion()),
    logo: `gameart.jpg`,
    executable: () => BANNERLORD_EXEC,
    setup: toBluebird((discovery: types.IDiscoveryResult) => setup(context, discovery, manager)),
    requiredFiles: [ BANNERLORD_EXEC ],
    parameters: [],
    requiresCleanup: true,
    environment: { SteamAPPId: STEAMAPP_ID.toString() },
    details: {
      steamAppId: STEAMAPP_ID,
      epicAppId: EPICAPP_ID,
      customOpenModsPath: MODULES,
    },
  });

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

  // Register the LoadOrder page.
  context.registerLoadOrderPage({
    gameId: GAME_ID,
    // Cast as any because this is strictly typed to React.ComponentClass but accepts a function component.
    createInfoPanel: (props) => React.createElement(LoadOrderInfoPanel, {...props}) as any,
    noCollectionGeneration: true,
    gameArtURL: `${__dirname}/gameart.jpg`,
    preSort: (items, _sortDir, updateType?) => preSort(context, manager, items, updateType) as any,
    callback: (loadOrder) => manager.setLoadOrder(loadOrder),
    itemRenderer: ((props: any) => React.createElement(LoadOrderItemRenderer, {...props, manager})) as any,
  });

  // Register Installer.
  const testModulePromise = (files: string[], gameId: string) => Promise.resolve(manager.testModule(files, gameId));
  const installModulePromise = (files: string[], destinationPath: string) => Promise.resolve(manager.installModule(files, destinationPath));
  context.registerInstaller(`bannerlordmodules`, 25, testModulePromise, installModulePromise);

  // Register AutoSort button
  const autoSortIcon = manager.isSorting() ? `spinner` : `loot-sort`;
  const autoSortAction = () => { manager.sort(); };
  const autoSortCondition = () => {
    const state = context.api.store?.getState();
    const gameId = selectors.activeGameId(state);
    return (gameId === GAME_ID);
  };
  context.registerAction(`generic-load-order-icons`, 200, autoSortIcon, {}, `Auto Sort`, autoSortAction, autoSortCondition);

  // Register Callbacks
  context.once(toBluebird<void>(async () => {
    //context.api.onAsync(`did-deploy`, async (profileId: string, _deployment: IDeployment) => manager.refreshModules(profileId));
    context.api.onAsync(`did-deploy`, async (_profileId: string, _deployment: IDeployment) => manager.setLoadOrder(manager.getLoadOrder()));

    //context.api.onAsync(`did-purge`, async (profileId: string) => manager.refreshModules(profileId));
    context.api.onAsync(`did-purge`, async (_profileId: string) => manager.setLoadOrder(manager.getLoadOrder()));

    context.api.events.on(`gamemode-activated`, (_gameMode: string) => {
      const state = context.api.getState();
      const profile = selectors.activeProfile(state);
      manager.setLoadOrder(manager.getLoadOrder());

      //manager.refreshModules(profile?.id);
    });

    context.api.onAsync(`added-files`, async (profileId: string, files: IAddedFiles[]) => {
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
          const mod = util.getSafe<types.IMod | undefined>(state.persistent.mods, [GAME_ID, entry.candidates[0]], undefined);
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
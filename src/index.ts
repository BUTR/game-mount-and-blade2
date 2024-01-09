import { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import { Settings } from './views/Settings';
import SaveList from './views/Saves/SaveList';
import { findGame, getBannerlordExec, prepareForModding, requiresLauncher, resolveModId, setLoadOrder } from './utils/util';
import { EPICAPP_ID, GAME_ID, LAUNCHER_EXEC, MODDING_KIT_EXEC, MODULES, STEAMAPP_ID, XBOX_ID } from './common';
import { IAddedFiles, IDeployment, VortexViewModel } from './types';
import { VortexLauncherManager } from './utils/VortexLauncherManager';
import { setCurrentSave, setSortOnDeploy } from './actions';

import LoadOrder from './loadOrder/BannerlordLoadOrder'
import { ILoadOrderEntry } from 'vortex-api/lib/types/api';

let loadOrder: LoadOrder;

let launcherManager: VortexLauncherManager;

const reducer: types.IReducerSpec = {
  reducers: {
    [setSortOnDeploy as any]: (state, payload) =>
      util.setSafe(state, [`sortOnDeploy`, payload.profileId], payload.sort),
    [actions.setLoadOrder as any]: (state, payload) => util.setSafe(state, [payload.id], payload.order),
    [setCurrentSave as any]: (state, payload) => util.setSafe(state, [`saveList`], payload),
  },
  defaults: {
    sortOnDeploy: {},
  },
};

const addOfficialLauncher = (context: types.IExtensionContext, discovery: types.IDiscoveryResult): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const launcherId = `TaleWorldsBannerlordLauncher`;
  const exec = path.basename(LAUNCHER_EXEC);
  const tool: types.IDiscoveredTool = {
    id: launcherId,
    name: `Official Launcher`,
    logo: `tw_launcher.png`,
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

const addModdingKit = (context: types.IExtensionContext, discovery: types.IDiscoveryResult, hidden?: boolean): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const toolId = `bannerlord-sdk`;
  const exec = path.basename(MODDING_KIT_EXEC);
  const tool: types.IDiscoveredTool = {
    id: toolId,
    name: `Modding Kit`,
    logo: `tw_launcher.png`,
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

const setup = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  // Quickly ensure that the official Launcher is added.
  addOfficialLauncher(context, discovery);
  try {
    await fs.statAsync(path.join(discovery.path, MODDING_KIT_EXEC));
    addModdingKit(context, discovery);
  } catch (err) {
    const tools = discovery?.tools;
    if (tools !== undefined && util.getSafe(tools, [`bannerlord-sdk`], undefined) !== undefined) {
      addModdingKit(context, discovery, true);
    }
  }

  await prepareForModding(context, discovery, manager);
};

const main = (context: types.IExtensionContext): boolean => {
  launcherManager = new VortexLauncherManager(context);
  loadOrder = new LoadOrder(context.api, launcherManager);
  
  // Register reducer
  context.registerReducer([`settings`, `mountandblade2`], reducer);

  // Register Settings
  const settingsOnSetSortOnDeploy = (profileId: string, sort: boolean) =>
    context.api.store?.dispatch(setSortOnDeploy(profileId, sort));
  const settingsProps = () => ({ t: context.api.translate, onSetSortOnDeploy: settingsOnSetSortOnDeploy });
  const settingsVisible = () => {
    const state = context.api.getState();
    const profile = selectors.activeProfile(state);
    return profile !== undefined && profile?.gameId === GAME_ID;
  };
  context.registerSettings(`Interface`, Settings, settingsProps, settingsVisible, 51);

  const tools: types.ITool[] = [
    {
      id: 'blse',
      name: 'Bannerlord Software Extender LauncherEx',
      shortName: 'BLSE LauncherEx',
      logo: 'blse.png',
      executable: () => 'Bannerlord.BLSE.LauncherEx.exe',
      requiredFiles: ['Bannerlord.BLSE.LauncherEx.exe'],
      relative: true,
      exclusive: true,
      defaultPrimary: true,
    },
    {
      id: 'blse-vanilla',
      name: 'Bannerlord Software Extender Vanilla Launcher',
      shortName: 'BLSE Vanilla Launcher',
      logo: 'blse.png',
      executable: () => 'Bannerlord.BLSE.Launcher.exe',
      requiredFiles: ['Bannerlord.BLSE.Launcher.exe'],
      relative: true,
      exclusive: true,
      defaultPrimary: false,
    }
  ];

  // Register Game
  context.registerGame({
    id: GAME_ID,
    name: `Mount & Blade II: Bannerlord (BUTR)`,
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => `.`,
    getGameVersion: (_gamePath, _exePath) => launcherManager.getGameVersionVortex(),
    logo: `gameart.jpg`,
    supportedTools: tools,
    executable: (discoveryPath) => getBannerlordExec(discoveryPath, context.api),
    setup: toBluebird((discovery: types.IDiscoveryResult) => setup(context, discovery, launcherManager)),
    requiresLauncher: (_gamePath, store) => requiresLauncher(store) as any,
    requiredFiles: [],
    parameters: [],
    requiresCleanup: true,
    environment: { SteamAPPId: STEAMAPP_ID.toString() },
    details: {
      steamAppId: STEAMAPP_ID,
      epicAppId: EPICAPP_ID,
      xboxId: XBOX_ID,
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

  context.registerLoadOrder(loadOrder);

  context.registerMainPage('savegame', 'Saves', SaveList, {
    id: 'bannerlord-saves',
    hotkey: 'A',
    group: 'per-game',
    visible: () => {
      if (context.api.store === undefined) {
        return false;
      }
      return selectors.activeGameId(context.api.store.getState()) === GAME_ID;
    },
    props: () => ({
      context: context,
      t: context.api.translate,
      launcherManager: launcherManager,
    }),
  });

  // Register Installer.
  context.registerInstaller(
    `bannerlordmodules`,
    25,
    launcherManager.testModuleVortex,
    launcherManager.installModuleVortex
  );

  // Register AutoSort button
  const autoSortIcon = launcherManager.isSorting() ? `spinner` : `loot-sort`;
  const autoSortAction = async () => {
    launcherManager.sort();
    const modules = launcherManager.moduleViewModels;
    const loadOrder = await Object.entries(modules).reduce(async (accumP, [id, mv]) => {
      const accum = await accumP;
      const loEntry: ILoadOrderEntry = {
        enabled: !mv.isDisabled,
        id,
        name: mv.moduleInfoExtended.name,
        data: mv,
        locked: false,
        modId: await resolveModId(context.api, mv),
      }
      accum.push(loEntry);
      return Promise.resolve(accum);
    }, Promise.resolve([]) as any);
    setLoadOrder(context.api, loadOrder);
    launcherManager.refreshModulesVortex();
  };
  const autoSortCondition = () => {
    const state = context.api.store?.getState();
    const gameId = selectors.activeGameId(state);
    return gameId === GAME_ID;
  };
  context.registerAction(
    `fb-load-order-icons`,
    200,
    autoSortIcon,
    {},
    `Auto Sort`,
    autoSortAction as any,
    autoSortCondition
  );

  // Register Callbacks
  context.once(
    toBluebird<void>(async () => {
      console.log(`BANNERLORD: context.once() context.api.store?.getState()`);
      console.log(context.api.store?.getState());

      context.api.onAsync(`did-deploy`, async (_profileId: string, _deployment: IDeployment) => {
        const state = context.api.store?.getState();
        const gameId = selectors.activeGameId(state);
        if (gameId !== GAME_ID) {
          return;
        }
        launcherManager.refreshModulesVortex();
      });

      context.api.onAsync(`did-purge`, async (_profileId: string) => {
        const state = context.api.store?.getState();
        const gameId = selectors.activeGameId(state);
        if (gameId !== GAME_ID) {
          return;
        }
        launcherManager.refreshModulesVortex();
      });

      context.api.setStylesheet('savegame', path.join(__dirname, 'savegame.scss'));

      context.api.events.on(`gamemode-activated`, (_gameMode: string) =>
        GAME_ID === _gameMode ? launcherManager.refreshModulesVortex() : null
      );

      context.api.onAsync(`added-files`, async (profileId: string, files: IAddedFiles[]) => {
        const state = context.api.store?.getState();
        const profile = selectors.profileById(state, profileId);
        if (profile.gameId !== GAME_ID) {
          return;
        }

        const game = util.getGame(GAME_ID);
        const discovery = selectors.discoveryByGame(state, GAME_ID);
        if (!discovery?.path) {
          // Can't do anything without a discovery path.
          return;
        }
        const modPaths = game.getModPaths ? game.getModPaths(discovery.path) : {};
        const installPath = selectors.installPathForGame(state, GAME_ID);

        await Promise.map(files, async (entry: { filePath: string; candidates: string[] }) => {
          // only act if we definitively know which mod owns the file
          if (entry.candidates.length === 1) {
            const mod = util.getSafe<types.IMod | undefined>(
              state.persistent.mods,
              [GAME_ID, entry.candidates[0]],
              undefined
            );
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
    })
  );

  return true;
};

export default main;

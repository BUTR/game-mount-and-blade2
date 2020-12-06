import Promise from 'bluebird';
import * as path from 'path';
import { actions, fs, selectors, util } from "vortex-api";
import { IExtensionContext, IDiscoveryResult } from 'vortex-api/lib/types/api';

import { GAME_ID, LAUNCHER_EXEC, STEAMAPP_ID, EPICAPP_ID, MODDING_KIT_EXEC, SUBMOD_FILE } from './constants';
import { LAUNCHER_DATA_PATH, BANNERLORD_EXEC, PARAMS_TEMPLATE, MODULES, OFFICIAL_MODULES } from './constants';
import { tSort, getDeployedModData, walkAsync, getXMLData } from './old-xml';


export const LAUNCHER_DATA = {
  singlePlayerSubMods: [],
  multiplayerSubMods: [],
}

let STORE_ID;
export let CACHE = {};

export async function refreshCacheOnEvent(context: IExtensionContext, refreshFunc, profileId): Promise<void> {
    CACHE = {};
    if (profileId === undefined) {
      return Promise.resolve();
    }
    const state = context.api.store.getState();
    const activeProfile = selectors.activeProfile(state);
    const deployProfile = selectors.profileById(state, profileId);
    if (!!activeProfile && !!deployProfile && (deployProfile.id !== activeProfile.id)) {
      // Deployment event seems to be executed for a profile other
      //  than the currently active one. Not going to continue.
      return Promise.resolve();
    }

    if (activeProfile?.gameId !== GAME_ID) {
      // Different game
      return Promise.resolve();
    }

    try {
      const deployedSubModules = await getDeployedSubModPaths(context);
      CACHE = await getDeployedModData(context, deployedSubModules);
    } catch (err) {
      // ProcessCanceled means that we were unable to scan for deployed
      //  subModules, probably because game discovery is incomplete.
      // It's beyond the scope of this function to report discovery
      //  related issues.
      return (err instanceof util.ProcessCanceled)
        ? Promise.resolve()
        : Promise.reject(err);
    }

    const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', activeProfile.id], {});

    // We're going to do a quick tSort at this point - not going to
    //  change the user's load order, but this will highlight any
    //  cyclic or missing dependencies.
    const modIds = Object.keys(CACHE);
    const sorted = tSort(modIds, true, loadOrder);

    if (!!refreshFunc) {
      refreshFunc();
    }

    return refreshGameParams(context, loadOrder);
  }

export function getValidationInfo(modVortexId) {
  // We expect the method caller to provide the vortexId of the subMod, as 
  //  this is how we store this information in the load order object.
  //  Reason why we need to search the cache by vortexId rather than subModId.
  const subModId = Object.keys(CACHE).find(key => CACHE[key].vortexId === modVortexId);
  const cyclic = util.getSafe(CACHE[subModId], ['invalid', 'cyclic'], []);
  const missing = util.getSafe(CACHE[subModId], ['invalid', 'missing'], []);
  return {
    cyclic,
    missing,
  }
}

export function findGame() {
  return util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString()])
    .then(game =>{
      STORE_ID = game.gameStoreId;
      return Promise.resolve(game.gamePath);
    });
}

function setModdingTool(context: IExtensionContext, discovery: IDiscoveryResult, hidden: any = null): void {
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
    };
  
    context.api.store.dispatch(actions.addDiscoveredTool(GAME_ID, toolId, tool));
}

function ensureOfficialLauncher(context: IExtensionContext, discovery: IDiscoveryResult): void {
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
    }));
}

async function refreshGameParams(context: IExtensionContext, loadOrder): Promise<void> {
    // Go through the enabled entries so we can form our game parameters.
    const enabled = (!!loadOrder && Object.keys(loadOrder).length > 0)
      ? Object.keys(loadOrder)
          .filter(key => loadOrder[key].enabled)
          .sort((lhs, rhs) => loadOrder[lhs].pos - loadOrder[rhs].pos)
          .reduce((accum, key) => {
            const cacheKeys = Object.keys(CACHE);
            const entry = cacheKeys.find(cacheElement => CACHE[cacheElement].vortexId === key);
            if (!!entry) {
              accum.push(entry);
            }
            return accum;
          }, [])
      : LAUNCHER_DATA.singlePlayerSubMods
          .filter(subMod => subMod.enabled)
          .map(subMod => subMod.subModId);
  
    // Currently Singleplayer only! (more research into MP needs to be done)
    const parameters = [
      PARAMS_TEMPLATE[0].replace('{{gameMode}}', 'singleplayer'),
      PARAMS_TEMPLATE[1].replace('{{subModIds}}', enabled.map(key => `*${key}`).join('')),
    ];
  
    // This launcher will not function unless the path is guaranteed to point
    //  towards the bannerlord executable. Given that earlier versions of this
    //  extension had targeted TaleWorlds.Launcher.exe instead - we need to make
    //  sure this is set correctly.
    context.api.store.dispatch(actions.setGameParameters(GAME_ID, {
      executable: BANNERLORD_EXEC,
      parameters
    }));
    
    return Promise.resolve();
}

async function getDeployedSubModPaths(context: IExtensionContext): Promise<any> {
    const state = context.api.store.getState();
    const discovery = util.getSafe(state, ['settings', 'gameMode', 'discovered', GAME_ID], undefined);
    if (discovery?.path === undefined) {
      return Promise.reject(new util.ProcessCanceled('game discovery is incomplete'));
    }
    const modulePath = path.join(discovery.path, MODULES);
    let moduleFiles;
    try {
      moduleFiles = await walkAsync(modulePath);
    } catch (err) {
      if (err instanceof util.UserCanceled) {
        return Promise.resolve([]);
      }
      const isMissingOfficialModules = ((err.code === 'ENOENT')
        && ([].concat([ MODULES ], Array.from(OFFICIAL_MODULES)))
              .indexOf(path.basename(err.path)) !== -1);
      const errorMsg = isMissingOfficialModules
        ? 'Game files are missing - please re-install the game'
        : err.message;
      context.api.showErrorNotification(errorMsg, err);
      return Promise.resolve([]);
    }
    const subModules = moduleFiles.filter(file => path.basename(file).toLowerCase() === SUBMOD_FILE);
    return Promise.resolve(subModules);
}

export async function prepareForModding(context: IExtensionContext, discovery: IDiscoveryResult): Promise<void> {
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
        : Promise.resolve())
  
    const idRegexp = /\<Id\>(.*?)\<\/Id\>/gm;
    const enabledRegexp = /\<IsSelected\>(.*?)\<\/IsSelected\>/gm;
    const trimTagsRegexp = /<[^>]*>?/gm;
    const createDataElement = (xmlNode) => {
      const nodeString = xmlNode.toString({ whitespace: false }).replace(/[ \t\r\n]/gm, '');
      if (!!nodeString) {
        return {
          subModId: nodeString.match(idRegexp)[0].replace(trimTagsRegexp, ''),
          enabled: nodeString.match(enabledRegexp)[0]
            .toLowerCase()
            .replace(trimTagsRegexp, '') === 'true',
        };
      } else {
        return undefined;
      }
    };
  
    // Check if we've already set the load order object for this profile
    //  and create it if we haven't.
    return startSteam().then(() => getXMLData(LAUNCHER_DATA_PATH)).then(launcherData => {
      try {
        const singlePlayerMods = launcherData.get('//UserData/SingleplayerData/ModDatas').childNodes();
        const multiPlayerMods = launcherData.get('//UserData/MultiplayerData/ModDatas').childNodes();
        LAUNCHER_DATA.singlePlayerSubMods = singlePlayerMods.reduce((accum, spm) => {
          const dataElement = createDataElement(spm);
          if (!!dataElement) {
            accum.push(dataElement);
          }
          return accum;
        }, []);
        LAUNCHER_DATA.multiplayerSubMods = multiPlayerMods.reduce((accum, mpm) => {
          const dataElement = createDataElement(mpm);
          if (!!dataElement) {
            accum.push(dataElement);
          }
          return accum;
        }, []);
      } catch (err) {
        return Promise.reject(new util.DataInvalid(err.message));
      }
    }).then(async () => {
      const deployedSubModules = await getDeployedSubModPaths(context);
      CACHE = await getDeployedModData(context, deployedSubModules);
  
      // We're going to do a quick tSort at this point - not going to
      //  change the user's load order, but this will highlight any
      //  cyclic or missing dependencies.
      const modIds = Object.keys(CACHE);
      const sorted = tSort(modIds, true);
    })
    .catch(err => {
      if (err instanceof util.NotFound) {
        context.api.showErrorNotification('Failed to find game launcher data',
          'Please run the game at least once through the official game launcher and '
        + 'try again', { allowReport: false });
        return Promise.resolve();
      } else if (err instanceof util.ProcessCanceled) {
        context.api.showErrorNotification('Failed to find game launcher data',
          err, { allowReport: false });
      }
  
      return Promise.reject(err);
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
import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';
import turbowalk, { IEntry, IWalkOptions } from 'turbowalk';
import { actions, fs, selectors, types, util } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { VortexLauncherManager, recommendBLSE, getBannerlordExec } from '.';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID, BANNERLORD_EXEC, GAME_ID, BLSE_EXE, LOAD_ORDER_SUFFIX } from '../common';

let STORE_ID: string;

export const findGame = toBluebird<string>(async (): Promise<string> => {
  const game = await util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]);
  STORE_ID = game.gameStoreId;
  return game.gamePath;
});

export const prepareForModding = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  // skip if BLSE found
  const blsePath = path.join(discovery.path, BLSE_EXE);
  const blseFound = await getPathExistsAsync(blsePath);
  if (!blseFound) {
    recommendBLSE(context);
  }

  // If game store not found, location may be set manually - allow setup function to continue.
  const findStoreId = (): Bluebird<string | void> => findGame().catch((_err) => Promise.resolve());
  const startSteam = (): Bluebird<void> => findStoreId().then(() => ((STORE_ID === `steam`)
    ? util.GameStoreHelper.launchGameStore(context.api, STORE_ID, undefined, true)
    : Promise.resolve()));

  // Check if we've already set the load order object for this profile and create it if we haven't.
  return startSteam().finally(() => {
    manager.setStore(STORE_ID);
    //manager.initializeModuleViewModels();
    //manager.orderBySavedLoadOrder();
  });
};

const getPathExistsAsync = async (path: string) => {
  try {
   await fs.statAsync(path);
   return true;
  }
  catch(err) {
    return false;
  }
}


export const forceRefresh = (api: types.IExtensionApi) => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  const action = {
    type: 'SET_FB_FORCE_UPDATE',
    payload: {
      profileId,
    },
  };
  if (api.store) {
    api.store.dispatch(action);
  }
}

export const setLoadOrder = (api: types.IExtensionApi, loadOrder: types.LoadOrder) => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  const PARAMS_TEMPLATE = ['/{{gameMode}}', '_MODULES_{{subModIds}}*_MODULES_'];
  const parameters = [
    PARAMS_TEMPLATE[0].replace('{{gameMode}}', 'singleplayer'),
    PARAMS_TEMPLATE[1].replace('{{subModIds}}', loadOrder.map(value => `*${value.id}`).join('')),
  ];
  const action = {
    type: 'SET_FB_LOAD_ORDER',
    payload: {
      profileId,
      loadOrder,
    },
  };
  if (api.store) {
    const discoveryPath = selectors.discoveryByGame(api.getState(), GAME_ID)?.path;
    const batched = [
      action,
      actions.setGameParameters(GAME_ID, {
        executable: getBannerlordExec(discoveryPath, api) || BANNERLORD_EXEC,
        parameters,
      }),
    ];
    util.batchDispatch(api.store, batched);
  }
}

interface IWalkOptionsWithFilter extends IWalkOptions {
  filter?: (entry: IEntry) => boolean;
}
export const walkPath = async (dirPath: string, walkOptions?: IWalkOptionsWithFilter): Promise<IEntry[]> => {
  walkOptions = walkOptions || { skipLinks: true, skipHidden: true, skipInaccessible: true };
  const walkResults: IEntry[] = [];
  return new Promise<IEntry[]>(async (resolve, reject) => {
    await turbowalk(dirPath, (entries: IEntry[]) => {
      const filtered = (walkOptions?.filter === undefined)
        ? entries
        : entries.filter(walkOptions.filter);
      walkResults.push(...filtered);
      return Promise.resolve() as any;
      // If the directory is missing when we try to walk it; it's most probably down to a collection being
      //  in the process of being installed/removed. We can safely ignore this.
    }, walkOptions).catch((err: any) => err.code === 'ENOENT' ? Promise.resolve() : Promise.reject(err));
    return resolve(walkResults);
  });
}

export const getLoadOrderFileName = (api: types.IExtensionApi): string => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  return `${profileId}${LOAD_ORDER_SUFFIX}`;
}

export const getLoadOrderFilePath = (api: types.IExtensionApi): string => {
  const state = api.getState();
  const loadOrderFileName = getLoadOrderFileName(api);
  return path.join(selectors.installPathForGame(state, GAME_ID), loadOrderFileName);
}

export const resolveModuleId = async (subModulePath: string): Promise<string | undefined> => {
  try {
    await fs.statAsync(subModulePath);
    const contents = await fs.readFileAsync(subModulePath, 'utf8');
    const data = await parseStringPromise(contents, { explicitArray: false, mergeAttrs: true });
    return data.Module.Id.value;
  } catch {
    return undefined;
  }
}

type ModuleIdMap = { [moduleId: string]: string };
const _moduleIdMap: ModuleIdMap = {};

export const resolveModId = async (api: types.IExtensionApi, module: vetypes.ModuleViewModel|string): Promise<string|undefined> => {
  const state = api.getState();
  const moduleId = typeof module === 'object' ? module.moduleInfoExtended?.id : module;
  if (moduleId === undefined) {
    return Promise.reject(new util.DataInvalid(`Module ID is undefined!`));
  }
  if (_moduleIdMap[moduleId] !== undefined) {
    return _moduleIdMap[moduleId];
  }
  const installationPath = selectors.installPathForGame(state, GAME_ID);
  const mods: { [modId: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  for (const [id, mod] of Object.entries(mods)) {
    const modPath = path.join(installationPath, mod.installationPath);
    const submodules = await walkPath(modPath,
      { filter: (entry: IEntry) => path.basename(entry.filePath).toLowerCase() === 'submodule.xml' });
    for (const submodule of submodules) {
      const subModuleId = await resolveModuleId(submodule.filePath);
      if (subModuleId === moduleId) {
        _moduleIdMap[moduleId] = id;
        return id;
      }
    }
  }

  return undefined;
}

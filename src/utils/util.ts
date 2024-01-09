import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import * as path from 'path';
import { actions, fs, selectors, types, util } from 'vortex-api';
import { gte } from 'semver';
import { types as vetypes } from '@butr/vortexextensionnative';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID, BANNERLORD_EXEC, BANNERLORD_EXEC_XBOX, GAME_ID, BLSE_MOD_ID, BLSE_URL, BLSE_EXE, LOAD_ORDER_SUFFIX } from '../common';
import { VortexLauncherManager } from './VortexLauncherManager';
import { LoadOrder } from 'vortex-api/lib/extensions/file_based_loadorder/types/types';
import { ModuleViewModel } from '@butr/vortexextensionnative/dist/main/lib/types/LauncherManager';

import { parseStringPromise } from 'xml2js'
import turbowalk, { IEntry, IWalkOptions } from 'turbowalk';

let STORE_ID: string;

const toChar = (avt: vetypes.ApplicationVersionType): string => {
  switch (avt) {
    case vetypes.ApplicationVersionType.Alpha: return "a";
    case vetypes.ApplicationVersionType.Beta: return "b";
    case vetypes.ApplicationVersionType.Development: return "d";
    case vetypes.ApplicationVersionType.EarlyAccess: return "e";
    case vetypes.ApplicationVersionType.Release: return "v";
    default: return avt.toString();
  }
};

export const versionToString = (av: vetypes.ApplicationVersion): string => {
  return `${toChar(av.applicationVersionType)}${av.major}.${av.minor}.${av.revision}.${av.changeSet}`
};

export const getVersion = (metadata: vetypes.DependentModuleMetadata): string => {
  if (!isVersionEmpty(metadata.version))  {
      return ` >= ${versionToString(metadata.version)}`;
  }
  if (!isVersionRangeEmpty(metadata.versionRange))  {
      return ` >= ${versionToString(metadata.versionRange.min)} <= ${versionToString(metadata.versionRange.max)}`;
  }
  return "";
};

export const isVersionEmpty = (av: vetypes.ApplicationVersion): boolean => {
  return av.applicationVersionType == vetypes.ApplicationVersionType.Alpha && av.major == 0 && av.minor == 0 && av.revision == 0 && av.changeSet == 0;
};
export const isVersionRangeEmpty = (avr: vetypes.ApplicationVersionRange): boolean => {
  return isVersionEmpty(avr.min) && isVersionEmpty(avr.max);
};

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
    manager.initializeModuleViewModels();
    manager.orderBySavedLoadOrder();
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

const recommendBLSE = (context: types.IExtensionContext) => {
  const blseMod = findBLSEMod(context.api);
  const title = blseMod ? 'BLSE is not deployed' : 'BLSE is not installed';
  const actionTitle = blseMod ? 'Deploy' : 'Get BLSE';
  const action = () => (blseMod
    ? deployBLSE(context.api)
    : downloadBLSE(context.api))
    .then(() => context.api.dismissNotification?.('blse-missing'));

  context.api.sendNotification?.({
    id: 'blse-missing',
    type: 'warning',
    title,
    message: 'BLSE is recommended to mod Bannerlord.',
    actions: [
      {
        title: actionTitle,
        action,
      },
    ]
  });
};

const findBLSEMod = (api: types.IExtensionApi): types.IMod | undefined => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  const profile = selectors.profileById(state, profileId);
  const isActive = (modId: string) => util.getSafe(profile, ['modState', modId, 'enabled'], false);
  const isBLSE = (mod: types.IMod) => mod.type === 'BLSE' && mod.attributes?.modId === 1;
  const mods: { [modId: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  const BLSEMods: types.IMod[] = Object.values(mods).filter((mod: types.IMod) => isBLSE(mod) && isActive(mod.id));

  return (BLSEMods.length === 0)
    ? undefined
    : BLSEMods.length > 1
      ? BLSEMods.reduce((prev: types.IMod | undefined, iter: types.IMod) => {
        if (prev === undefined) {
          return iter;
        }
        return (gte(iter.attributes?.version ?? '0.0.0', prev.attributes?.version ?? '0.0.0')) ? iter : prev;
      }, undefined)
      : BLSEMods[0];
}

const deployBLSE = async (api: types.IExtensionApi) => {
  await util.toPromise(cb => api.events.emit('deploy-mods', cb));
  await util.toPromise(cb => api.events.emit('start-quick-discovery', () => cb(null)));

  const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
  const tool = discovery?.tools?.['blse'];
  if (tool) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, tool.id));
  }
}

const downloadBLSE = async (api: types.IExtensionApi, update?: boolean) => {
  api.dismissNotification?.('blse-missing');
  api.sendNotification?.({
    id: 'blse-installing',
    message: update ? 'Updating BLSE' : 'Installing BLSE',
    type: 'activity',
    noDismiss: true,
    allowSuppress: false,
  });

  if (api.ext?.ensureLoggedIn !== undefined) {
    await api.ext.ensureLoggedIn();
  }

  try {
    const modFiles = await api.ext.nexusGetModFiles?.(GAME_ID, BLSE_MOD_ID) || [];

    const fileTime = (input: any) => Number.parseInt(input.uploaded_time, 10);

    const file = modFiles
      .filter(file => file.category_id === 1)
      .sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs))[0];

    if (file === undefined) {
      throw new util.ProcessCanceled('No BLSE main file found');
    }

    const dlInfo = {
      game: GAME_ID,
      name: 'BLSE',
    };

    const nxmUrl = `nxm://${GAME_ID}/mods/${BLSE_MOD_ID}/files/${file.file_id}`;
    const dlId = await util.toPromise<string>(cb =>
      api.events.emit('start-download', [nxmUrl], dlInfo, undefined, cb, undefined, { allowInstall: false }));
    const modId = await util.toPromise<string>(cb =>
      api.events.emit('start-install-download', dlId, { allowAutoEnable: false }, cb));
    const profileId = selectors.lastActiveProfileForGame(api.getState(), GAME_ID);
    await actions.setModsEnabled(api, profileId, [modId], true, {
      allowAutoDeploy: false,
      installed: true,
    });

    await deployBLSE(api);
  } catch (err) {
    api.showErrorNotification?.('Failed to download/install BLSE', err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.('blse-installing');
  }
}

export const getBannerlordExec = (discoveryPath: string|undefined, api: types.IExtensionApi): string => {
  const discovery: types.IDiscoveryResult = (api.getState().persistent.gameMode as any).discovered?.[GAME_ID];
  if (!discovery) return BANNERLORD_EXEC;
  if (discovery.store === `xbox`) return BANNERLORD_EXEC_XBOX;
  if (!!discovery.store && [`gog`, `steam`, `epic`].includes(discovery.store)) return BANNERLORD_EXEC;
  if (!discovery.store && !!discoveryPath) {
    // Brute force the detection by manually checking the paths.
    try {
      fs.statSync(path.join(discoveryPath, BANNERLORD_EXEC_XBOX));
      return BANNERLORD_EXEC_XBOX;
    } catch (err) {
      return BANNERLORD_EXEC;
    }
  }
  return BANNERLORD_EXEC;
};

export const requiresLauncher = async (store?: string): Promise<{ launcher: string, addInfo?: any } | undefined> => {
  if (store === `xbox`) {
    return {
      launcher: `xbox`,
      addInfo: {
        appId: XBOX_ID,
        parameters: [{ appExecName: `bin.Gaming.Desktop.x64.Shipping.Client.Launcher.Native` }],
      },
    };
  }
  return undefined;
};

export function forceRefresh(api: types.IExtensionApi) {
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

export function setLoadOrder(api: types.IExtensionApi, loadOrder: LoadOrder) {
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
export async function walkPath(dirPath: string, walkOptions?: IWalkOptionsWithFilter): Promise<IEntry[]> {
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

export function getLoadOrderFileName(api: types.IExtensionApi): string {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  return `${profileId}${LOAD_ORDER_SUFFIX}`;
}

export function getLoadOrderFilePath(api: types.IExtensionApi): string {
  const state = api.getState();
  const loadOrderFileName = getLoadOrderFileName(api);
  return path.join(selectors.installPathForGame(state, GAME_ID), loadOrderFileName);
}

export async function resolveModuleId(subModulePath: string): Promise<string | undefined> {
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

export async function resolveModId(api: types.IExtensionApi, module: ModuleViewModel|string): Promise<string|undefined> {
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

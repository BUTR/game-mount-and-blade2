//@ts-ignore
import Bluebird, { Promise } from 'bluebird';
import { method as toBluebird } from 'bluebird';

import path from 'path';
import { fs, types, util } from 'vortex-api';
import { BannerlordModuleManager } from '@butr/blmodulemanagernative/dist/module/lib';
import * as bmmTypes from '@butr/blmodulemanagernative/dist/module/lib';
import { GAME_ID, MODULES, OFFICIAL_MODULES, SUBMOD_FILE } from './common';
import { IModuleCache, IModuleInfoExtendedExt } from './types';
import { walkAsync } from './util';

let CACHE: IModuleCache = {};
export const getCache = () => {
  return CACHE;
}

export const refreshCache = async (context: types.IExtensionContext, bmm: BannerlordModuleManager) => {
  try {
    const subModuleFilePaths: string[] = await getDeployedSubModPaths(context);
    CACHE = await getDeployedModData(context.api, subModuleFilePaths, bmm);
  } catch (err) {
    return Promise.reject(err);
  }
}

const getDeployedSubModPaths = async (context: types.IExtensionContext) => {
  const state = context.api.store?.getState();
  const discovery = util.getSafe(state, ['settings', 'gameMode', 'discovered', GAME_ID], undefined);
  if (discovery?.path === undefined) {
    return Promise.reject(new util.ProcessCanceled('game discovery is incomplete'));
  }
  const modulePath = path.join(discovery.path, MODULES);
  let moduleFiles: string[];
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

const getDeployedModData = async (api: types.IExtensionApi, subModuleFilePaths: string[], bmm: BannerlordModuleManager) => {
  const state = api.getState();
  const mods: { [modId: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  const getVortexId = (subModId: string) => {
    for (const mod of Object.values(mods)) {
      const subModIds = util.getSafe(mod, ['attributes', 'subModIds'], []);
      if (subModIds.includes(subModId)) {
        return mod.id;
      }
    }
    return undefined;
  };

  const modules: { [subModId: string]: IModuleInfoExtendedExt } = {};
  const invalidSubMods = [] as string[];
  for (const subMod of subModuleFilePaths) {
    const data = await fs.readFileAsync(subMod, { encoding: 'utf8' });
    const module = bmm.getModuleInfo(data.trim());
    if (!module) {
      invalidSubMods.push(subMod);
      continue;
    }
    const vortexId = getVortexId(module.id);
    modules[module.id] = {
      ...module,
      vortexId,
    };
  }

  if (invalidSubMods.length > 0) {
    api.showErrorNotification('Invalid submodule files - inform the mod authors',
      Array.from(new Set(invalidSubMods)).join('\n'), { allowReport: false, id: 'invalidSubMods' });
  }

  return modules;
}

const missingDependencies = (bmm: BannerlordModuleManager, subMod: IModuleInfoExtendedExt) => {
  const depsFulfilled = bmm.areAllDependenciesOfModulePresent(Object.values(CACHE), subMod);
  if (depsFulfilled) {
    return [];
  }

  const subModIds = Object.keys(CACHE);
  const missing = subMod.dependentModules.filter(dep => !subModIds.includes(dep.id))
    .map(dep => dep.id);
  return missing;
}

const versionToDisplay = (ver: bmmTypes.ApplicationVersion) => {
  return `${ver.major}.${ver.minor}.${ver.revision}`;
}

export const getIncompatibilities = (bmm: BannerlordModuleManager, subMod: IModuleInfoExtendedExt) => {
  const dependencies = subMod.dependentModules;
  const incorrectVersions = [] as { id: string, currentVersion: string, requiredVersion: string }[];
  for (const dep of dependencies) {
    const depMod = CACHE[dep.id];
    if (!depMod) {
      // dependency is missing entirely
      continue;
    }
    const comparisonRes = bmm.compareVersions(depMod.version, dep.version);
    if (comparisonRes !== 1) {
      incorrectVersions.push(
        {
          id: dep.id,
          currentVersion: versionToDisplay(depMod.version),
          requiredVersion: versionToDisplay(dep.version),
        });
    }
  }
  return incorrectVersions;
}

export const getValidationInfo = (bmm: BannerlordModuleManager, id: string) => {
  const subModule = Object.values(CACHE).find(entry => (entry.vortexId === id) || (entry.id === id));
  if (!subModule) {
    // Probably not deployed yet
    return { missing: [], incompatible: [] };
  }
  const missing = missingDependencies(bmm, subModule);
  const incompatible = getIncompatibilities(bmm, subModule);
  return { missing, incompatible };
}

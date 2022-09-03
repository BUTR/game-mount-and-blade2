import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { fs, types, util } from 'vortex-api';
import { BannerlordModuleManager, ApplicationVersion } from '@butr/blmodulemanagernative';
import {
  GAME_ID, MODULES, OFFICIAL_MODULES, SUBMOD_FILE,
} from '../common';
import {
  IIncompatibleModule, IMods, IModuleCache, IModuleInfoExtendedExt, IValidationResult,
} from '../types';
import { walkAsync } from './util';

let CACHE: IModuleCache = { };
export const getCache = (): Readonly<IModuleCache> => CACHE;

const getDeployedSubModPaths = async (context: types.IExtensionContext): Promise<string[]> => {
  const state = context.api.store?.getState();
  const discovery = util.getSafe<types.IDiscoveryResult | undefined>(state, [`settings`, `gameMode`, `discovered`, GAME_ID], undefined);
  if (discovery?.path === undefined) {
    throw new util.ProcessCanceled(`game discovery is incomplete`);
  }
  const modulePath = path.join(discovery.path, MODULES);
  let moduleFiles: string[];
  try {
    moduleFiles = await walkAsync(modulePath);
  } catch (err: any) {
    if (err instanceof util.UserCanceled) {
      return [];
    }
    const isMissingOfficialModules = ((err.code === `ENOENT`) && (Array<string>().concat([MODULES], Array.from(OFFICIAL_MODULES))).indexOf(path.basename(err.path)) !== -1);
    const errorMsg = isMissingOfficialModules ? `Game files are missing - please re-install the game` : err.message;

    if (context.api.showErrorNotification) context.api.showErrorNotification(errorMsg, err);
    return [];
  }
  const subModules = moduleFiles.filter((file) => path.basename(file).toLowerCase() === SUBMOD_FILE);
  return subModules;
};

const getDeployedModData = async (api: types.IExtensionApi, subModuleFilePaths: string[], bmm: BannerlordModuleManager): Promise<IModuleCache> => {
  const state = api.getState();
  const mods = util.getSafe<IMods>(state, [`persistent`, `mods`, GAME_ID], {});
  const getVortexId = (subModId: string): string | undefined => {
    for (const mod of Object.values(mods)) {
      const subModIds = util.getSafe<string[]>(mod, [`attributes`, `subModIds`], []);
      if (subModIds.includes(subModId)) {
        return mod.id;
      }
    }
    return undefined;
  };

  const modules: { [subModId: string]: IModuleInfoExtendedExt } = {};
  const invalidSubMods = Array<string>();
  /* eslint-disable no-await-in-loop */
  for (const subMod of subModuleFilePaths) {
    const data = await fs.readFileAsync(subMod, { encoding: `utf8` });
    const module = bmm.getModuleInfo(data.trim());
    if (module) {
      const vortexId = getVortexId(module.id);
      modules[module.id] = {
        ...module,
        vortexId,
      };
    } else {
      invalidSubMods.push(subMod);
    }
  }
  /* eslint-enable no-await-in-loop */

  if (invalidSubMods.length > 0) {
    api.showErrorNotification?.(
      `Invalid submodule files - inform the mod authors`,
      Array.from(new Set(invalidSubMods)).join(`\n`),
      { allowReport: false, id: `invalidSubMods` },
    );
  }

  return modules;
};

export const refreshCache = async (context: types.IExtensionContext, bmm: BannerlordModuleManager): Promise<void> => {
  const subModuleFilePaths = await getDeployedSubModPaths(context);
  CACHE = await getDeployedModData(context.api, subModuleFilePaths, bmm);
};

const missingDependencies = (bmm: BannerlordModuleManager, subMod: IModuleInfoExtendedExt): string[] => {
  const depsFulfilled = bmm.areAllDependenciesOfModulePresent(Object.values(CACHE), subMod);
  if (depsFulfilled) {
    return Array<string>();
  }

  const subModIds = Object.keys(CACHE);
  const missing = subMod.dependentModules.filter((dep) => !subModIds.includes(dep.id)).map((dep) => dep.id);
  return missing;
};

const versionToDisplay = (ver: ApplicationVersion): string => `${ver.major}.${ver.minor}.${ver.revision}`;

export const getIncompatibilities = (bmm: BannerlordModuleManager, subMod: IModuleInfoExtendedExt): IIncompatibleModule[] => {
  const dependencies = subMod.dependentModules;
  const incorrectVersions = Array<IIncompatibleModule>();
  for (const dep of dependencies) {
    const depMod = CACHE[dep.id];
    if (depMod) {
      const comparisonRes = bmm.compareVersions(depMod.version, dep.version);
      if (comparisonRes !== 1) {
        incorrectVersions.push({
          id: dep.id,
          currentVersion: versionToDisplay(depMod.version),
          requiredVersion: versionToDisplay(dep.version),
        });
      }
    }
  }
  return incorrectVersions;
};

export const getValidationInfo = (bmm: BannerlordModuleManager, id: string): IValidationResult => {
  const subModule = Object.values(CACHE).find((entry) => (entry.vortexId === id) || (entry.id === id));
  if (!subModule) {
    // Probably not deployed yet
    return { missing: Array<string>(), incompatible: Array<IIncompatibleModule>() };
  }
  const missing = missingDependencies(bmm, subModule);
  const incompatible = getIncompatibilities(bmm, subModule);
  return { missing, incompatible };
};

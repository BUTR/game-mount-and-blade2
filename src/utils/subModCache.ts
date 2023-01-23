import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { fs, types, util } from 'vortex-api';
import { types as vetypes, BannerlordModuleManager } from '@butr/vortexextensionnative';

import { walkAsync } from './traverseUtils';
import {
  GAME_ID, MODULES, OFFICIAL_MODULES, SUBMODULE_FILE,
} from '../common';
import {
  IIncompatibleModule, IMods, IModuleCache, IModuleInfoExtendedExt, IValidationCache, IValidationResult,
} from '../types';
import { IValidationManager } from '@butr/blmodulemanagernative';

let CACHE: IModuleCache = { };
let VALIDATION_CACHE: IValidationCache = { };
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
  const subModules = moduleFiles.filter((file) => path.basename(file).toLowerCase() === SUBMODULE_FILE);
  return subModules;
};

const getDeployedModData = async (api: types.IExtensionApi, subModuleFilePaths: string[]): Promise<IModuleCache> => {
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
    const module = BannerlordModuleManager.getModuleInfo(data.trim());
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

export const refreshCache = async (context: types.IExtensionContext): Promise<void> => {
  const subModuleFilePaths = await getDeployedSubModPaths(context);
  CACHE = await getDeployedModData(context.api, subModuleFilePaths);

  const modules = Object.values(CACHE);
  VALIDATION_CACHE = modules.reduce((map, moduleInfo) => {
    const module = modules.find((entry) => (entry.vortexId === moduleInfo.id) || (entry.id === moduleInfo.id));
    const validationManager: IValidationManager = {
      isSelected: function (moduleId: string): boolean {
        return true;
      }
    };
    map[moduleInfo.id] = BannerlordModuleManager.validateModule(modules, module!, validationManager);
    return map;
  }, {} as IValidationCache);
};

const versionToDisplay = (ver: vetypes.ApplicationVersion): string => `${ver.major}.${ver.minor}.${ver.revision}`;

export const getIncompatibilities = (subMod: IModuleInfoExtendedExt): IIncompatibleModule[] => {
  const dependencies = subMod.dependentModules;
  const incorrectVersions = Array<IIncompatibleModule>();
  for (const dep of dependencies) {
    const depMod = CACHE[dep.id];
    if (depMod) {
      const comparisonRes = BannerlordModuleManager.compareVersions(depMod.version, dep.version);
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

export const getModuleIssues = (id: string): vetypes.ModuleIssue[] => {
  return VALIDATION_CACHE[id];
};

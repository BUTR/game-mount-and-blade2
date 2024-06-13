import { BannerlordModuleManager, Utils, types as vetypes } from '@butr/vortexextensionnative';
import { types } from 'vortex-api';
import { ISaveGame, MismatchedModuleMap, ModulesByName } from './types';
import { LocalizationManager, versionToString, VortexLauncherManager } from '../../utils';
import { IModuleCache } from '../../types';

export const getModulesByName = (modules: Readonly<IModuleCache>): ModulesByName => {
  return Object.values(modules).reduce<ModulesByName>((map, current) => {
    map[current.name] = current;
    return map;
  }, {});
};

export const getNameDuplicates = (allModules: Readonly<IModuleCache>): string[] | undefined => {
  const allModulesByName = getModulesByName(allModules);

  const moduleNames = Object.keys(allModulesByName);
  const uniqueModuleNames = new Set(moduleNames);

  const duplicates = moduleNames.filter((currentValue) => {
    if (uniqueModuleNames.has(currentValue)) {
      uniqueModuleNames.delete(currentValue);
    }
  });

  if (duplicates.length !== 0) {
    return duplicates;
  }

  return undefined;
};

export const getMissingModuleNames = (saveGame: Readonly<ISaveGame>, allModules: Readonly<IModuleCache>) => {
  const allModulesByName = getModulesByName(allModules);
  return Object.keys(saveGame.modules).reduce<string[]>((map, current) => {
    if (!allModulesByName[current]) {
      map.push(current);
    }
    return map;
  }, []);
};

export const getMismatchedModuleVersions = (
  api: types.IExtensionApi,
  saveGame: Readonly<ISaveGame>,
  allModules: Readonly<IModuleCache>
) => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const allModulesByName = getModulesByName(allModules);
  const mismatchedVersions = Object.keys(saveGame.modules).reduce<MismatchedModuleMap>((map, moduleName) => {
    // is the module even installed?
    if (!allModulesByName[moduleName]) {
      return map; // just return the previous accumulation and move on
    }

    const installedVerson = allModulesByName[moduleName]!.version;
    const saveVersion = saveGame.modules[moduleName]!;
    if (BannerlordModuleManager.compareVersions(installedVerson, saveVersion) !== 0) {
      map[moduleName] = {
        name: moduleName,
        installed: installedVerson,
        save: saveVersion,
      };
    }
    return map;
  }, {});

  const mismatchedVersionsLocalized = Object.values(mismatchedVersions).map<string>((current) => {
    const module = allModulesByName[current.name]!;
    return t('{=nYVWoomO}{MODULEID}. Required {REQUIREDVERSION}. Actual {ACTUALVERSION}', {
      MODULEID: module.id,
      REQUIREDVERSION: versionToString(current.save),
      ACTUALVERSION: versionToString(current.installed),
    });
  });

  if (mismatchedVersionsLocalized.length !== 0) {
    return mismatchedVersionsLocalized;
  }

  return undefined;
};

export const getLoadOrderIssues = (saveGame: ISaveGame, allModules: Readonly<IModuleCache>) => {
  const allModulesByName = getModulesByName(allModules);
  const modules = Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithMetadata | undefined>((current) => allModulesByName[current])
    .filter((x): x is vetypes.ModuleInfoExtendedWithMetadata => !!x);
  return Utils.isLoadOrderCorrect(modules);
};

export const getModules = (
  saveGame: ISaveGame,
  manager: VortexLauncherManager
): Array<vetypes.ModuleInfoExtendedWithMetadata> => {
  const allModules = manager.getAllModules();
  const allModulesByName = getModulesByName(allModules);
  return Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithMetadata | undefined>((current) => allModulesByName[current])
    .filter((x): x is vetypes.ModuleInfoExtendedWithMetadata => !!x);
};

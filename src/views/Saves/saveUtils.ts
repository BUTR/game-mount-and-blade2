import { BannerlordModuleManager, types as vetypes, Utils } from '@butr/vortexextensionnative';
import { ISaveGame } from './types';
import { VortexLauncherManager, versionToString } from '../../utils';
import { IModuleCache } from '../../types';

type MismatchedModule = {
  name: string;
  installed: vetypes.ApplicationVersion;
  save: vetypes.ApplicationVersion;
};
type MismatchedModuleMap = {
  [name: string]: MismatchedModule;
};

type ModulesByName = {
  [name: string]: vetypes.ModuleInfoExtendedWithPath;
};

export const getModulesByName = (modules: Readonly<IModuleCache>): ModulesByName => {
  return Object.values(modules).reduce<ModulesByName>((map, current) => {
    map[current.name] = current;
    return map;
  }, {});
};

export const getNameDuplicatesError = (saveGame: Readonly<ISaveGame>, manager: VortexLauncherManager, allModules: Readonly<IModuleCache>): string[] | undefined => {
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
    /*
    return launcherManager.localize('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
      MODULENAMES: duplicates.join('\n'),
    });*/
  }

  return undefined;
};

export const getMissingModuleNamesError = (saveGame: Readonly<ISaveGame>, manager: VortexLauncherManager, allModules: Readonly<IModuleCache>): Array<string> => {
  const allModulesByName = getModulesByName(allModules);
  return Object.keys(saveGame.modules).reduce<string[]>((map, current) => {
    if (!allModulesByName[current]) {
      map.push(current);
    }
    return map;
  }, []);
};

export const getMismatchedModuleVersionsWarning = (saveGame: Readonly<ISaveGame>, manager: VortexLauncherManager, allModules: Readonly<IModuleCache>): string[] | undefined => {
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
    return manager.localize('{=nYVWoomO}{MODULEID}. Required {REQUIREDVERSION}. Actual {ACTUALVERSION}', {
      MODULEID: module.id,
      REQUIREDVERSION: versionToString(current.save),
      ACTUALVERSION: versionToString(current.installed),
    });
  });

  if (mismatchedVersionsLocalized.length !== 0) {
    return mismatchedVersionsLocalized;
    /*
    return launcherManager.localize('{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}', {
      MODULEMODULESNAMES: mismatchedVersionsLocalized.join('\n\n'),
    });*/
  }

  return undefined;
};

export const getLoadOrderIssues = (saveGame: ISaveGame, manager: VortexLauncherManager, allModules: Readonly<IModuleCache>): Array<string> => {
  const allModulesByName = getModulesByName(allModules);
  const modules = Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithPath | undefined>((current) => allModulesByName[current])
    .filter((x): x is vetypes.ModuleInfoExtendedWithPath => !!x);
  return Utils.isLoadOrderCorrect(modules);
};

export const getModules = (saveGame: ISaveGame, manager: VortexLauncherManager): Array<vetypes.ModuleInfoExtendedWithPath> => {
  const allModules = manager.getAllModules();
  const allModulesByName = getModulesByName(allModules);
  return Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithPath | undefined>((current) => allModulesByName[current])
    .filter((x): x is vetypes.ModuleInfoExtendedWithPath => !!x);
};

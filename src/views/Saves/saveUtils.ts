import { BannerlordModuleManager, types as vetypes, Utils } from '@butr/vortexextensionnative';
import { IModuleCache, ModuleInfoExtendedWithPathWithVortexMetadata } from '../../types';
import { versionToString } from '../../utils/util';
import { VortexLauncherManager } from '../../utils/VortexLauncherManager';
import { ISaveGame } from './SaveList';

type MismatchedModule = {
  name: string;
  installed: vetypes.ApplicationVersion;
  save: vetypes.ApplicationVersion;
};
type MismatchedModuleMap = {
  [name: string]: MismatchedModule;
};

type AvailableModulesByName = {
  [name: string]: ModuleInfoExtendedWithPathWithVortexMetadata;
};

export const getAvailableModulesByName = (availableModules: Readonly<IModuleCache>): AvailableModulesByName => {
  return Object.values(availableModules).reduce((map, current) => {
    map[current.name] = current;
    return map;
  }, {} as AvailableModulesByName);
};

export const getNameDuplicatesError = (
  saveGame: ISaveGame,
  launcherManager: VortexLauncherManager,
  availableModules: Readonly<IModuleCache>
): string[] | undefined => {
  const availableModulesByName = getAvailableModulesByName(availableModules);

  const moduleNames = Object.keys(availableModulesByName);
  const uniqueModuleNames = new Set(moduleNames);

  console.log('getNameDuplicatesError');
  console.log(uniqueModuleNames);

  const duplicates = moduleNames.filter((currentValue) => {
    if (uniqueModuleNames.has(currentValue)) {
      uniqueModuleNames.delete(currentValue);
    }
  });

  console.log(duplicates);

  if (duplicates.length !== 0) {
    return duplicates;
    /*
    return launcherManager.localize('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
      MODULENAMES: duplicates.join('\n'),
    });*/
  }

  return undefined;
};

export const getMissingModuleNamesError = (
  saveGame: ISaveGame,
  launcherManager: VortexLauncherManager,
  availableModules: Readonly<IModuleCache>
): Array<string> => {
  const availableModulesByName = getAvailableModulesByName(availableModules);

  return Object.keys(saveGame.modules).reduce((map, current) => {
    if (availableModulesByName[current] == undefined) {
      map.push(current);
    }
    return map;
  }, Array<string>());
};

export const getMismatchedModuleVersionsWarning = (
  saveGame: ISaveGame,
  launcherManager: VortexLauncherManager,
  availableModules: Readonly<IModuleCache>
): string[] | undefined => {
  const availableModulesByName = getAvailableModulesByName(availableModules);
  //debugger;
  const mismatchedVersions = Object.keys(saveGame.modules).reduce((map, moduleName) => {
    // is the module even installed?
    if (availableModulesByName[moduleName] == undefined) {
      return map; // just return the previous accumulation and move on
    }

    const installedVerson = availableModulesByName[moduleName].version;
    const saveVersion = saveGame.modules[moduleName];
    if (BannerlordModuleManager.compareVersions(installedVerson, saveVersion) !== 0) {
      map[moduleName] = {
        name: moduleName,
        installed: installedVerson,
        save: saveVersion,
      };
    }
    return map;
  }, {} as MismatchedModuleMap);

  const mismatchedVersionsLocalized = Object.values(mismatchedVersions).map((current) => {
    const module = availableModulesByName[current.name];
    return launcherManager.localize('{=nYVWoomO}{MODULEID}. Required {REQUIREDVERSION}. Actual {ACTUALVERSION}', {
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

export const getLoadOrderIssues = (
  saveGame: ISaveGame,
  launcherManager: VortexLauncherManager,
  availableModules: Readonly<IModuleCache>
): Array<string> => {
  const availableModulesByName = getAvailableModulesByName(availableModules);
  const modules = Object.keys(saveGame.modules)
    .map((current) => {
      return availableModulesByName[current];
    })
    .filter((x) => x !== undefined);
  return Utils.isLoadOrderCorrect(modules);
};

export const getModules = (
  saveGame: ISaveGame,
  launcherManager: VortexLauncherManager
): Array<ModuleInfoExtendedWithPathWithVortexMetadata> => {
  const availableModules = launcherManager.getModulesVortex();
  const availableModulesByName = getAvailableModulesByName(availableModules);
  return Object.keys(saveGame.modules)
    .map((current) => {
      return availableModulesByName[current];
    })
    .filter((x) => x !== undefined);
};

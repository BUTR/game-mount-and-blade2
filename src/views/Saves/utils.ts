import { types } from 'vortex-api';
import { BannerlordModuleManager, Utils, types as vetypes } from '@butr/vortexextensionnative';
import { ISaveGame, ISaveList, MismatchedModuleMap, ModulesByName } from './types';
import { IModuleCache } from '../../types';
import { LocalizationManager } from '../../localization';
import { versionToString, VortexLauncherManager } from '../../launcher';

const createSaveGame = (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  current: vetypes.SaveMetadata,
  currentIndex: number
): ISaveGame | undefined => {
  if (current['Modules'] === undefined) {
    return undefined;
  }

  const saveGame: ISaveGame = {
    index: currentIndex + 1,
    name: current.Name,
    applicationVersion:
      current['ApplicationVersion'] !== undefined
        ? BannerlordModuleManager.parseApplicationVersion(current['ApplicationVersion'])
        : undefined,
    creationTime: current['CreationTime'] !== undefined ? parseInt(current['CreationTime']) : undefined,
    characterName: current['CharacterName'],
    mainHeroGold: current['MainHeroGold'] !== undefined ? parseInt(current['MainHeroGold']) : undefined,
    mainHeroLevel: current['MainHeroLevel'] !== undefined ? parseInt(current['MainHeroLevel']) : undefined,
    dayLong: current['DayLong'] !== undefined ? parseFloat(current['DayLong']) : undefined,

    clanBannerCode: current['ClanBannerCode'],
    clanFiefs: current['ClanFiefs'] !== undefined ? parseInt(current['ClanFiefs']) : undefined,
    clanInfluence: current['ClanInfluence'] !== undefined ? parseFloat(current['ClanInfluence']) : undefined,

    mainPartyFood: current['MainPartyFood'] !== undefined ? parseFloat(current['MainPartyFood']) : undefined,
    mainPartyHealthyMemberCount:
      current['MainPartyHealthyMemberCount'] !== undefined
        ? parseInt(current['MainPartyHealthyMemberCount'])
        : undefined,
    mainPartyPrisonerMemberCount:
      current['MainPartyPrisonerMemberCount'] !== undefined
        ? parseInt(current['MainPartyPrisonerMemberCount'])
        : undefined,
    mainPartyWoundedMemberCount:
      current['MainPartyWoundedMemberCount'] !== undefined
        ? parseInt(current['MainPartyWoundedMemberCount'])
        : undefined,
    version: current['Version'] !== undefined ? parseInt(current['Version']) : undefined,
    modules: {}, // blank dictionary for now
  };

  // build up modules dictionary?
  const moduleNames = current['Modules'].split(';');

  const saveChangeSet = saveGame.applicationVersion?.changeSet ?? 0;
  for (const module of moduleNames) {
    const key = module;
    const moduleValue = current['Module_' + module];
    if (moduleValue === undefined) {
      continue;
    }

    const version = BannerlordModuleManager.parseApplicationVersion(moduleValue);
    if (version.changeSet === saveChangeSet) {
      version.changeSet = 0;
    }
    saveGame.modules[key] = version;
  }

  saveGame.duplicateModules = getNameDuplicates(allModules);
  saveGame.loadOrderIssues = getLoadOrderIssues(saveGame, allModules);
  saveGame.missingModules = getMissingModuleNames(saveGame, allModules);
  saveGame.mismatchedModuleVersions = getMismatchedModuleVersions(api, saveGame, allModules);

  return saveGame;
};

export const getSaves = (api: types.IExtensionApi): ISaveList => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const launcherManager = VortexLauncherManager.getInstance(api);

  const saveList: ISaveList = {
    ['nosave']: {
      index: 0,
      name: t('No Save'),
      modules: {},
    },
  };

  const allModules = launcherManager.getAllModules();
  const saveMetadatas = launcherManager.getSaveFiles();

  saveMetadatas.reduce<ISaveList>((prev, current, currentIndex) => {
    const save = createSaveGame(api, allModules, current, currentIndex);
    if (!save) {
      return prev;
    }

    prev[current.Name] = save;

    return prev;
  }, saveList);

  return saveList;
};

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

  if (duplicates.length) {
    return duplicates;
  }

  return undefined;
};

export const getMissingModuleNames = (saveGame: Readonly<ISaveGame>, allModules: Readonly<IModuleCache>): string[] => {
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
): string[] | undefined => {
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

  if (mismatchedVersionsLocalized.length) {
    return mismatchedVersionsLocalized;
  }

  return undefined;
};

export const getLoadOrderIssues = (saveGame: ISaveGame, allModules: Readonly<IModuleCache>): string[] => {
  const allModulesByName = getModulesByName(allModules);
  const modules = Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithMetadata | undefined>((current) => allModulesByName[current])
    .filter((x): x is vetypes.ModuleInfoExtendedWithMetadata => x !== undefined);
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
    .filter((x): x is vetypes.ModuleInfoExtendedWithMetadata => x !== undefined);
};

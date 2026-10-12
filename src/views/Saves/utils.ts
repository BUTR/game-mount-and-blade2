import ticksToDate from "ticks-to-date";
import { types } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  Utils,
  types as vetypes,
} from "@butr/vortexextensionnative";
import {
  ISaveGame,
  ISaveList,
  MismatchedModuleMap,
  ModulesByName,
} from "./types";
import { IModuleCache } from "../../types";
import { LocalizationManager } from "../../localization/manager";
import { VortexLauncherManager } from "../../launcher/manager";
import { versionToString } from "../../butr/version";

const parseIntField = (
  metadata: vetypes.SaveMetadata,
  key: string,
): number | undefined =>
  metadata[key] !== undefined ? parseInt(metadata[key]) : undefined;

const parseFloatField = (
  metadata: vetypes.SaveMetadata,
  key: string,
): number | undefined =>
  metadata[key] !== undefined ? parseFloat(metadata[key]) : undefined;

const createSaveGame = (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  current: vetypes.SaveMetadata,
  currentIndex: number,
): ISaveGame | undefined => {
  if (current["Modules"] === undefined) {
    return undefined;
  }

  const saveGame: ISaveGame = {
    index: currentIndex + 1,
    name: current.Name,
    applicationVersion:
      current["ApplicationVersion"] !== undefined
        ? BannerlordModuleManager.parseApplicationVersion(
            current["ApplicationVersion"],
          )
        : undefined,
    creationTime: parseIntField(current, "CreationTime"),
    characterName: current["CharacterName"],
    mainHeroGold: parseIntField(current, "MainHeroGold"),
    mainHeroLevel: parseIntField(current, "MainHeroLevel"),
    dayLong: parseFloatField(current, "DayLong"),

    clanBannerCode: current["ClanBannerCode"],
    clanFiefs: parseIntField(current, "ClanFiefs"),
    clanInfluence: parseFloatField(current, "ClanInfluence"),

    mainPartyFood: parseFloatField(current, "MainPartyFood"),
    mainPartyHealthyMemberCount: parseIntField(
      current,
      "MainPartyHealthyMemberCount",
    ),
    mainPartyPrisonerMemberCount: parseIntField(
      current,
      "MainPartyPrisonerMemberCount",
    ),
    mainPartyWoundedMemberCount: parseIntField(
      current,
      "MainPartyWoundedMemberCount",
    ),
    version: parseIntField(current, "Version"),
    modules: {}, // blank dictionary for now
  };

  // build up modules dictionary?
  const moduleNames = current["Modules"].split(";");

  const saveChangeSet = saveGame.applicationVersion?.changeSet ?? 0;
  for (const module of moduleNames) {
    const key = module;
    const moduleValue = current[`Module_${module}`];
    if (moduleValue === undefined) {
      continue;
    }

    const version =
      BannerlordModuleManager.parseApplicationVersion(moduleValue);
    if (version.changeSet === saveChangeSet) {
      version.changeSet = 0;
    }
    saveGame.modules[key] = version;
  }

  saveGame.duplicateModules = getNameDuplicates(allModules);
  saveGame.loadOrderIssues = getLoadOrderIssues(saveGame, allModules);
  saveGame.missingModules = getMissingModuleNames(saveGame, allModules);
  saveGame.mismatchedModuleVersions = getMismatchedModuleVersions(
    api,
    saveGame,
    allModules,
  );

  return saveGame;
};

export const getSavesAsync = async (
  api: types.IExtensionApi,
): Promise<ISaveList> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const launcherManager = VortexLauncherManager.getInstance(api);

  const saveList: ISaveList = {
    ["nosave"]: {
      index: 0,
      name: t("No Save"),
      modules: {},
    },
  };

  try {
    const allModules = await launcherManager.getAllModulesAsync();
    const saveMetadatas = await launcherManager.getSaveFilesAsync();

    saveMetadatas.reduce<ISaveList>((prev, current, currentIndex) => {
      const save = createSaveGame(api, allModules, current, currentIndex);
      if (!save) {
        return prev;
      }

      prev[current.Name] = save;

      return prev;
    }, saveList);
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to import added file to mod!"), err);
  }

  return saveList;
};

export const getModulesByName = (
  modules: Readonly<IModuleCache>,
): ModulesByName => {
  return Object.values(modules).reduce<ModulesByName>((map, current) => {
    map[current.name] = current;
    return map;
  }, {});
};

/**
 * A module the save lists. Saves list modules by id, older ones by name
 */
export const findSaveModule = (
  allModules: Readonly<IModuleCache>,
  allModulesByName: Readonly<ModulesByName>,
  key: string,
): vetypes.ModuleInfoExtendedWithMetadata | undefined =>
  allModules[key] ?? allModulesByName[key];

export const getNameDuplicates = (
  allModules: Readonly<IModuleCache>,
): string[] | undefined => {
  const allModulesByName = getModulesByName(allModules);
  const moduleNames = Object.keys(allModulesByName);
  const nameCount = new Map<string, number>();

  moduleNames.forEach((name) => {
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  });

  const duplicates = Array.from(nameCount.entries())
    .filter(([_, count]) => count > 1)
    .map<string>(([name]) => name);

  return duplicates.length ? duplicates : undefined;
};

export const getMissingModuleNames = (
  saveGame: Readonly<ISaveGame>,
  allModules: Readonly<IModuleCache>,
): string[] => {
  const allModulesByName = getModulesByName(allModules);
  return Object.keys(saveGame.modules).reduce<string[]>((map, current) => {
    if (!findSaveModule(allModules, allModulesByName, current)) {
      map.push(current);
    }
    return map;
  }, []);
};

export const getMismatchedModuleVersions = (
  api: types.IExtensionApi,
  saveGame: Readonly<ISaveGame>,
  allModules: Readonly<IModuleCache>,
): string[] | undefined => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const allModulesByName = getModulesByName(allModules);
  const mismatchedVersions = Object.keys(
    saveGame.modules,
  ).reduce<MismatchedModuleMap>((map, moduleName) => {
    // is the module even installed?
    const installed = findSaveModule(allModules, allModulesByName, moduleName);
    if (!installed) {
      return map; // just return the previous accumulation and move on
    }

    const installedVerson = installed.version;
    const saveVersion = saveGame.modules[moduleName]!;
    if (
      BannerlordModuleManager.compareVersions(installedVerson, saveVersion) !==
      0
    ) {
      map[moduleName] = {
        name: moduleName,
        installed: installedVerson,
        save: saveVersion,
      };
    }
    return map;
  }, {});

  const mismatchedVersionsLocalized = Object.values(
    mismatchedVersions,
  ).map<string>((current) => {
    const module = findSaveModule(allModules, allModulesByName, current.name)!;
    return t(
      "{=nYVWoomO}{MODULEID}. Required {REQUIREDVERSION}. Actual {ACTUALVERSION}",
      {
        MODULEID: module.id,
        REQUIREDVERSION: versionToString(current.save),
        ACTUALVERSION: versionToString(current.installed),
      },
    );
  });

  if (mismatchedVersionsLocalized.length) {
    return mismatchedVersionsLocalized;
  }

  return undefined;
};

export const getLoadOrderIssues = (
  saveGame: ISaveGame,
  allModules: Readonly<IModuleCache>,
): string[] => {
  const allModulesByName = getModulesByName(allModules);
  const modules = Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithMetadata | undefined>((current) =>
      findSaveModule(allModules, allModulesByName, current),
    )
    .filter(
      (x): x is vetypes.ModuleInfoExtendedWithMetadata => x !== undefined,
    );
  return Utils.isLoadOrderCorrect(modules);
};

export const getModulesAsync = async (
  saveGame: ISaveGame,
  manager: VortexLauncherManager,
): Promise<Array<vetypes.ModuleInfoExtendedWithMetadata>> => {
  const allModules = await manager.getAllModulesAsync();
  const allModulesByName = getModulesByName(allModules);
  return Object.keys(saveGame.modules)
    .map<vetypes.ModuleInfoExtendedWithMetadata | undefined>((current) =>
      findSaveModule(allModules, allModulesByName, current),
    )
    .filter(
      (x): x is vetypes.ModuleInfoExtendedWithMetadata => x !== undefined,
    );
};

/**
 * Calculates the total number of discrepancies between the save's required modules and installed mods.
 */
export const countIssues = (save: ISaveGame): number =>
  (save.loadOrderIssues?.length ?? 0) +
  (save.missingModules?.length ?? 0) +
  (save.duplicateModules?.length ?? 0) +
  (save.mismatchedModuleVersions?.length ?? 0);

export const formatSaveTime = (save: ISaveGame): string =>
  save.creationTime !== undefined
    ? (ticksToDate(save.creationTime)?.toLocaleString() ?? "")
    : "";

export interface ISaveFilters {
  /**
   * Restricts results to saves without any missing, mismatched, or conflicting mod issues.
   */
  withoutIssues: boolean;
  /**
   * Character names to include in results, or empty to display all characters.
   */
  characters: string[];
}

export const DEFAULT_SAVE_FILTERS: ISaveFilters = {
  withoutIssues: false,
  characters: [],
};

export const countActiveSaveFilters = (filters: ISaveFilters): number =>
  (filters.withoutIssues ? 1 : 0) + (filters.characters.length > 0 ? 1 : 0);

const matchesSave = (
  save: ISaveGame,
  filters: ISaveFilters,
  query: string,
  withCharacters: boolean,
): boolean =>
  (query === "" ||
    [save.name, save.characterName].some(
      (value) => value?.toLowerCase().includes(query) === true,
    )) &&
  (!filters.withoutIssues || countIssues(save) === 0) &&
  (!withCharacters ||
    filters.characters.length === 0 ||
    filters.characters.includes(save.characterName ?? ""));

/**
 * Filters save games based on active search text (matching save or character name) and filter settings.
 */
export const filterSaves = (
  saves: Readonly<Record<string, ISaveGame>>,
  filters: ISaveFilters,
  search: string,
): Record<string, ISaveGame> => {
  const query = search.trim().toLowerCase();
  if (query === "" && countActiveSaveFilters(filters) === 0) {
    return saves;
  }
  return Object.fromEntries(
    Object.entries(saves).filter(([, save]) =>
      matchesSave(save, filters, query, true),
    ),
  );
};

/**
 * Aggregates character choices matching current search text and filters, including save counts per character.
 * Currently selected characters are retained to allow deselecting.
 */
export const getCharacterChoices = (
  saves: Readonly<Record<string, ISaveGame>>,
  filters: ISaveFilters,
  search: string,
): { character: string; count: number }[] => {
  const query = search.trim().toLowerCase();
  const counts = new Map<string, number>(
    filters.characters.map((character) => [character, 0]),
  );
  for (const save of Object.values(saves)) {
    const character = save.characterName;
    if (
      character !== undefined &&
      character !== "" &&
      matchesSave(save, filters, query, false)
    ) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((lhs, rhs) => lhs[0].localeCompare(rhs[0]))
    .map(([character, count]) => ({ character, count }));
};

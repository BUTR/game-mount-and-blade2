import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { IModuleCache } from "@bannerlord/core/types";
import { ISaveGame } from "./types";
import {
  countActiveSaveFilters,
  countIssues,
  DEFAULT_SAVE_FILTERS,
  filterSaves,
  formatSaveTime,
  getCharacterChoices,
  getLoadOrderIssues,
  getMismatchedModuleVersions,
  getMissingModuleNames,
  getModulesAsync,
  getNameDuplicates,
  getSavesAsync,
  ISaveFilters,
} from "./utils";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";

const mocks = vi.hoisted(() => ({
  isLoadOrderCorrect: vi.fn<(modules: { id: string }[]) => string[]>(),
  getAllModulesAsync: vi.fn<() => Promise<unknown>>(),
  getSaveFilesAsync: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@butr/vortexextensionnative", () => {
  const ApplicationVersionType = {
    Alpha: "Alpha",
    Beta: "Beta",
    EarlyAccess: "EarlyAccess",
    Release: "Release",
    Development: "Development",
    Invalid: "Invalid",
  };
  const prefixes: Record<string, string> = {
    a: "Alpha",
    b: "Beta",
    e: "EarlyAccess",
    v: "Release",
    d: "Development",
  };
  type Version = {
    applicationVersionType: string;
    major: number;
    minor: number;
    revision: number;
    changeSet: number;
  };
  const parts = (v: Version): number[] => [
    v.major,
    v.minor,
    v.revision,
    v.changeSet,
  ];
  return {
    types: { ApplicationVersionType },
    BannerlordModuleManager: {
      parseApplicationVersion: (content: string): Version => {
        const [major = 0, minor = 0, revision = 0, changeSet = 0] = content
          .slice(1)
          .split(".")
          .map(Number);
        return {
          applicationVersionType: prefixes[content[0] ?? ""] ?? "Invalid",
          major,
          minor,
          revision,
          changeSet,
        };
      },
      compareVersions: (x: Version, y: Version): number => {
        const lhs = parts(x);
        const rhs = parts(y);
        for (let i = 0; i < lhs.length; i++) {
          const diff = lhs[i]! - rhs[i]!;
          if (diff !== 0) {
            return Math.sign(diff);
          }
        }
        return 0;
      },
    },
    Utils: { isLoadOrderCorrect: mocks.isLoadOrderCorrect },
  };
});

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      localize: (template: string, values: Record<string, string> = {}) =>
        template
          .replace(/^\{=[^}]*\}/, "")
          .replace(/\{([A-Z]+)\}/g, (all, key: string) => values[key] ?? all),
    }),
  },
}));

vi.mock("@bannerlord/core/launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({
      getAllModulesAsync: mocks.getAllModulesAsync,
      getSaveFilesAsync: mocks.getSaveFilesAsync,
    }),
  },
}));

const version = (
  major: number,
  minor = 0,
  revision = 0,
  changeSet = 0,
): vetypes.ApplicationVersion =>
  ({
    applicationVersionType: "Release",
    major,
    minor,
    revision,
    changeSet,
  }) as unknown as vetypes.ApplicationVersion;

const module = (
  id: string,
  v: vetypes.ApplicationVersion,
  name = id,
): vetypes.ModuleInfoExtendedWithMetadata =>
  ({
    id,
    name,
    version: v,
  }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

const cache = (
  ...modules: vetypes.ModuleInfoExtendedWithMetadata[]
): IModuleCache => Object.fromEntries(modules.map((m) => [m.id, m]));

const save = (
  name: string,
  options: Partial<Omit<ISaveGame, "name">> = {},
): ISaveGame => ({ index: 1, modules: {}, ...options, name });

const api = {
  showErrorNotification: vi.fn(),
} as unknown as types.IExtensionApi;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isLoadOrderCorrect.mockReturnValue([]);
});

describe("countIssues", () => {
  it("adds up every kind of issue", () => {
    expect(
      countIssues(
        save("s", {
          loadOrderIssues: ["a", "b"],
          missingModules: ["c"],
          duplicateModules: ["d"],
          mismatchedModuleVersions: ["e", "f", "g"],
        }),
      ),
    ).toBe(7);
  });

  it("is zero for a save without checks", () => {
    expect(countIssues(save("s"))).toBe(0);
  });
});

describe("formatSaveTime", () => {
  it("is empty without a creation time", () => {
    expect(formatSaveTime(save("s"))).toBe("");
  });

  it("formats the .NET ticks of the creation time", () => {
    // 2024-01-02T03:04:05Z in .NET ticks
    const ticks = 638397614450000000;
    const expected = new Date(Date.UTC(2024, 0, 2, 3, 4, 5)).toLocaleString();

    expect(formatSaveTime(save("s", { creationTime: ticks }))).toBe(expected);
  });
});

describe("save filters", () => {
  const saves: Record<string, ISaveGame> = {
    nosave: save("No Save"),
    a1: save("Autosave 1", { characterName: "Arwa" }),
    a2: save("Battle of Pravend", {
      characterName: "Arwa",
      missingModules: ["Some.Mod"],
    }),
    d1: save("Derthert's Rise", { characterName: "Derthert" }),
    e1: save("Unnamed", { characterName: "" }),
  };

  const filters = (options: Partial<ISaveFilters>): ISaveFilters => ({
    ...DEFAULT_SAVE_FILTERS,
    ...options,
  });

  it("counts the active filters", () => {
    expect(countActiveSaveFilters(DEFAULT_SAVE_FILTERS)).toBe(0);
    expect(
      countActiveSaveFilters(
        filters({ withoutIssues: true, characters: ["A", "B"] }),
      ),
    ).toBe(2);
  });

  it("returns the same saves without search or filters", () => {
    expect(filterSaves(saves, DEFAULT_SAVE_FILTERS, "  ")).toBe(saves);
  });

  it("searches save and character names, ignoring case and spaces around", () => {
    expect(
      Object.keys(filterSaves(saves, DEFAULT_SAVE_FILTERS, " ARWA ")),
    ).toEqual(["a1", "a2"]);
    expect(
      Object.keys(filterSaves(saves, DEFAULT_SAVE_FILTERS, "pravend")),
    ).toEqual(["a2"]);
  });

  it("leaves out saves with issues", () => {
    expect(
      Object.keys(filterSaves(saves, filters({ withoutIssues: true }), "")),
    ).toEqual(["nosave", "a1", "d1", "e1"]);
  });

  it("keeps only the chosen characters", () => {
    expect(
      Object.keys(
        filterSaves(saves, filters({ characters: ["Derthert", "Arwa"] }), ""),
      ),
    ).toEqual(["a1", "a2", "d1"]);
  });

  it("combines the search with the filters", () => {
    expect(
      Object.keys(
        filterSaves(
          saves,
          filters({ withoutIssues: true, characters: ["Arwa"] }),
          "arwa",
        ),
      ),
    ).toEqual(["a1"]);
  });

  it("lists the characters with their save counts, sorted", () => {
    expect(getCharacterChoices(saves, DEFAULT_SAVE_FILTERS, "")).toEqual([
      { character: "Arwa", count: 2 },
      { character: "Derthert", count: 1 },
    ]);
  });

  it("counts the characters' saves the search and other filters keep, ignoring the character filter", () => {
    expect(
      getCharacterChoices(
        saves,
        filters({ withoutIssues: true, characters: ["Derthert"] }),
        "",
      ),
    ).toEqual([
      { character: "Arwa", count: 1 },
      { character: "Derthert", count: 1 },
    ]);
  });

  it("keeps a chosen character no save matches, so it can be deselected", () => {
    expect(
      getCharacterChoices(saves, filters({ characters: ["Calatild"] }), "arwa"),
    ).toEqual([
      { character: "Arwa", count: 2 },
      { character: "Calatild", count: 0 },
    ]);
  });
});

describe("module checks", () => {
  const installed = cache(
    module("Native", version(1, 2, 9)),
    module("Bannerlord.Harmony", version(2, 3, 0), "Harmony"),
    module("Bannerlord.UIExtenderEx", version(2, 8, 0), "UIExtenderEx"),
  );

  it("lists the save's modules that aren't installed, by id or by name", () => {
    const s = save("s", {
      modules: {
        Native: version(1, 2, 9),
        Harmony: version(2, 3, 0),
        "Bannerlord.UIExtenderEx": version(2, 8, 0),
        "Missing.Mod": version(1),
        "Missing Name": version(1),
      },
    });

    expect(getMissingModuleNames(s, installed)).toEqual([
      "Missing.Mod",
      "Missing Name",
    ]);
  });

  it("describes the installed modules in other versions than the save's", () => {
    const s = save("s", {
      modules: {
        Native: version(1, 2, 9),
        Harmony: version(2, 2, 0),
        "Bannerlord.UIExtenderEx": version(2, 9, 0),
        "Missing.Mod": version(1),
      },
    });

    expect(getMismatchedModuleVersions(api, s, installed)).toEqual([
      "Bannerlord.Harmony. Required v2.2.0.0. Actual v2.3.0.0",
      "Bannerlord.UIExtenderEx. Required v2.9.0.0. Actual v2.8.0.0",
    ]);
  });

  it("has no mismatched versions when every installed module matches", () => {
    const s = save("s", {
      modules: { Native: version(1, 2, 9), "Missing.Mod": version(1) },
    });

    expect(getMismatchedModuleVersions(api, s, installed)).toBeUndefined();
  });

  it("checks the load order of the installed modules in the save's order", () => {
    mocks.isLoadOrderCorrect.mockReturnValue(["issue"]);
    const s = save("s", {
      modules: {
        UIExtenderEx: version(2, 8, 0),
        "Missing.Mod": version(1),
        "Bannerlord.Harmony": version(2, 3, 0),
      },
    });

    expect(getLoadOrderIssues(s, installed)).toEqual(["issue"]);
    expect(
      mocks.isLoadOrderCorrect.mock.calls[0]?.[0].map((m) => m.id),
    ).toEqual(["Bannerlord.UIExtenderEx", "Bannerlord.Harmony"]);
  });

  it("finds the installed modules of a save in its order", async () => {
    mocks.getAllModulesAsync.mockResolvedValue(installed);
    const s = save("s", {
      modules: {
        Harmony: version(2, 3, 0),
        "Missing.Mod": version(1),
        Native: version(1, 2, 9),
      },
    });

    const modules = await getModulesAsync(
      s,
      VortexLauncherManager.getInstance(api),
    );

    expect(modules.map((m) => m.id)).toEqual(["Bannerlord.Harmony", "Native"]);
  });

  it("has no duplicates when every module name is unique", () => {
    expect(getNameDuplicates(installed)).toBeUndefined();
  });

  it("lists module names two installed modules share", () => {
    const duplicates = cache(
      module("A.One", version(1), "Same"),
      module("A.Two", version(1), "Same"),
    );

    expect(getNameDuplicates(duplicates)).toEqual(["Same"]);
  });
});

describe("getSavesAsync", () => {
  const installed = cache(
    module("Native", version(1, 2, 9)),
    module("Bannerlord.Harmony", version(2, 3, 0, 120), "Harmony"),
  );

  it("has the No Save entry first, then each save with modules by name", async () => {
    mocks.getAllModulesAsync.mockResolvedValue(installed);
    mocks.getSaveFilesAsync.mockResolvedValue([
      { Name: "No Modules" },
      {
        Name: "Campaign",
        ApplicationVersion: "v1.2.9.36994",
        Modules: "Native;Bannerlord.Harmony;Missing.Mod;Unlisted",
        Module_Native: "v1.2.9.36994",
        "Module_Bannerlord.Harmony": "v2.3.0.120",
        "Module_Missing.Mod": "v1.0.0.0",
        CharacterName: "Arwa",
        CreationTime: "638397614450000000",
        MainHeroGold: "12345",
        MainHeroLevel: "17",
        DayLong: "102.5",
        ClanInfluence: "33.25",
        ClanFiefs: "2",
        MainPartyHealthyMemberCount: "80",
        Version: "1",
      },
    ]);

    const saves = await getSavesAsync(api);

    expect(Object.keys(saves)).toEqual(["nosave", "Campaign"]);
    expect(saves["nosave"]).toEqual({ index: 0, name: "No Save", modules: {} });
    const campaign = saves["Campaign"]!;
    expect(campaign).toMatchObject({
      index: 2,
      name: "Campaign",
      characterName: "Arwa",
      creationTime: 638397614450000000,
      mainHeroGold: 12345,
      mainHeroLevel: 17,
      dayLong: 102.5,
      clanInfluence: 33.25,
      clanFiefs: 2,
      mainPartyHealthyMemberCount: 80,
      version: 1,
      missingModules: ["Missing.Mod"],
    });
    expect(campaign.mainPartyFood).toBeUndefined();
    expect(campaign.clanBannerCode).toBeUndefined();
    expect(Object.keys(campaign.modules)).toEqual([
      "Native",
      "Bannerlord.Harmony",
      "Missing.Mod",
    ]);
  });

  it("drops the game's change set from the modules built with it", async () => {
    mocks.getAllModulesAsync.mockResolvedValue(installed);
    mocks.getSaveFilesAsync.mockResolvedValue([
      {
        Name: "Campaign",
        ApplicationVersion: "v1.2.9.36994",
        Modules: "Native;Bannerlord.Harmony",
        Module_Native: "v1.2.9.36994",
        "Module_Bannerlord.Harmony": "v2.3.0.120",
      },
    ]);

    const campaign = (await getSavesAsync(api))["Campaign"]!;

    expect(campaign.modules["Native"]?.changeSet).toBe(0);
    expect(campaign.modules["Bannerlord.Harmony"]?.changeSet).toBe(120);
    expect(campaign.mismatchedModuleVersions).toBeUndefined();
  });

  it("notifies and keeps only the No Save entry when the saves can't be read", async () => {
    const error = new Error("boom");
    mocks.getAllModulesAsync.mockResolvedValue(installed);
    mocks.getSaveFilesAsync.mockRejectedValue(error);

    const saves = await getSavesAsync(api);

    expect(Object.keys(saves)).toEqual(["nosave"]);
    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Failed to read the saves",
      error,
    );
  });
});

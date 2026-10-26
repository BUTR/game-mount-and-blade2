import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import {
  libraryToLibraryVM,
  libraryToPersistence,
  libraryToVortex,
  libraryVMToVortex,
  persistenceToLibrary,
  vortexToLibrary,
  vortexToLibraryVM,
  vortexToPersistence,
} from "./converters";
import { getModuleAttributes } from "../vortex/modFinder";
import {
  IModuleCache,
  PersistenceLoadOrderStorage,
  VortexLoadOrderEntry,
} from "../types";

vi.mock("@butr/vortexextensionnative", () => ({
  BannerlordModuleManager: { validateModule: vi.fn(() => []) },
}));

vi.mock("../vortex/modFinder", () => ({
  getModuleAttributes: vi.fn(() => []),
}));

const api = {} as types.IExtensionApi;

const module = (id: string): vetypes.ModuleInfoExtendedWithMetadata =>
  ({
    id,
    name: `${id} name`,
  }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

const vortexEntry = (
  id: string,
  options: {
    enabled?: boolean;
    locked?: VortexLoadOrderEntry["locked"];
    index?: number;
    withData?: boolean;
  } = {},
): VortexLoadOrderEntry =>
  ({
    id,
    name: `${id} name`,
    enabled: options.enabled ?? true,
    ...(options.locked !== undefined && { locked: options.locked }),
    ...(options.withData !== false && {
      data: {
        moduleInfoExtended: module(id),
        index: options.index ?? 0,
        hasSteamBinariesOnXbox: null,
        hasObfuscatedBinaries: null,
      },
    }),
  }) as unknown as VortexLoadOrderEntry;

const libraryEntry = (
  id: string,
  index: number,
  isSelected = true,
): vetypes.LoadOrderEntry => ({
  id,
  name: `${id} name`,
  isSelected,
  isDisabled: false,
  index,
});

const cache = (...ids: string[]): IModuleCache =>
  Object.fromEntries(ids.map((id) => [id, module(id)]));

const failValidationOf = (failingId: string): void => {
  vi.mocked(BannerlordModuleManager.validateModule).mockImplementation(
    (_modules, target) =>
      target.id === failingId
        ? [{ target } as unknown as vetypes.ModuleIssue]
        : [],
  );
};

beforeEach(() => {
  vi.mocked(BannerlordModuleManager.validateModule).mockReset();
  vi.mocked(BannerlordModuleManager.validateModule).mockReturnValue([]);
  vi.mocked(getModuleAttributes).mockReset();
  vi.mocked(getModuleAttributes).mockReturnValue([]);
});

describe("vortexToPersistence", () => {
  it("numbers the entries by their position in the Vortex list", () => {
    const result = vortexToPersistence([
      vortexEntry("Native", { index: 7 }),
      vortexEntry("SandBox", { index: 3 }),
    ]);

    expect(result.map((x) => [x.id, x.index])).toEqual([
      ["Native", 0],
      ["SandBox", 1],
    ]);
  });

  it("stores enabled as isSelected", () => {
    const result = vortexToPersistence([
      vortexEntry("Native"),
      vortexEntry("Bannerlord.Harmony", { enabled: false }),
    ]);

    expect(result.map((x) => x.isSelected)).toEqual([true, false]);
  });

  it.each([
    ["true", true],
    ["always", true],
    ["false", false],
    ["never", false],
  ] as const)("stores locked %s as isDisabled %s", (locked, expected) => {
    const [result] = vortexToPersistence([vortexEntry("Native", { locked })]);

    expect(result?.isDisabled).toBe(expected);
  });

  it("stores boolean locked true as isDisabled", () => {
    const [result] = vortexToPersistence([
      vortexEntry("Native", { locked: true }),
    ]);

    expect(result?.isDisabled).toBe(true);
  });
});

describe("persistence and library", () => {
  const persisted: PersistenceLoadOrderStorage = [
    {
      id: "Native",
      name: "Native",
      isSelected: true,
      isDisabled: false,
      index: 0,
    },
    {
      id: "Bannerlord.Harmony",
      name: "Harmony",
      isSelected: false,
      isDisabled: true,
      index: 1,
    },
  ];

  it("keys the library load order by module id", () => {
    const library = persistenceToLibrary(persisted);

    expect(Object.keys(library)).toEqual(["Native", "Bannerlord.Harmony"]);
    expect(library["Bannerlord.Harmony"]).toEqual(persisted[1]);
  });

  it("round-trips without losing fields or order", () => {
    expect(libraryToPersistence(persistenceToLibrary(persisted))).toEqual(
      persisted,
    );
  });

  it("keeps the last entry when a module id is listed twice", () => {
    const library = persistenceToLibrary([
      { ...persisted[0]!, index: 0 },
      { ...persisted[0]!, index: 5, isSelected: false },
    ]);

    expect(Object.keys(library)).toEqual(["Native"]);
    expect(library["Native"]?.index).toBe(5);
  });
});

describe("vortexToLibrary", () => {
  it("indexes the modules by position and keeps their selection", () => {
    const library = vortexToLibrary([
      vortexEntry("Native", { index: 9 }),
      vortexEntry("Bannerlord.Harmony", { enabled: false, locked: "always" }),
    ]);

    expect(library).toEqual({
      Native: {
        id: "Native",
        name: "Native name",
        isSelected: true,
        isDisabled: false,
        index: 0,
      },
      "Bannerlord.Harmony": {
        id: "Bannerlord.Harmony",
        name: "Bannerlord.Harmony name",
        isSelected: false,
        isDisabled: true,
        index: 1,
      },
    });
  });
});

describe("vortexToLibraryVM", () => {
  it("drops entries without module data or an installed module", () => {
    const result = vortexToLibraryVM(
      [
        vortexEntry("Native"),
        vortexEntry("NoData", { withData: false }),
        vortexEntry("NotInstalled"),
      ],
      cache("Native", "NoData"),
    );

    expect(result.map((x) => x.moduleInfoExtended.id)).toEqual(["Native"]);
  });

  it("uses the module from the cache and the entry's saved index", () => {
    const allModules = cache("Native");
    const [result] = vortexToLibraryVM(
      [vortexEntry("Native", { index: 4 })],
      allModules,
    );

    expect(result?.moduleInfoExtended).toBe(allModules["Native"]);
    expect(result?.index).toBe(4);
  });

  it("is valid only when enabled and without validation issues", () => {
    failValidationOf("Broken");

    const result = vortexToLibraryVM(
      [
        vortexEntry("Native"),
        vortexEntry("Broken"),
        vortexEntry("Disabled", { enabled: false }),
      ],
      cache("Native", "Broken", "Disabled"),
    );

    expect(result.map((x) => [x.moduleInfoExtended.id, x.isValid])).toEqual([
      ["Native", true],
      ["Broken", false],
      ["Disabled", false],
    ]);
    expect(result.map((x) => x.isSelected)).toEqual([true, true, false]);
  });

  it("validates against the installed modules and the enabled state of the load order", () => {
    vortexToLibraryVM(
      [
        vortexEntry("Native"),
        vortexEntry("Off", { enabled: false }),
        vortexEntry("NotInstalled"),
      ],
      cache("Native", "Off"),
    );

    const [modules, , validationManager] = vi.mocked(
      BannerlordModuleManager.validateModule,
    ).mock.calls[0]!;
    expect(modules.map((x) => x.id)).toEqual(["Native", "Off"]);
    expect(validationManager.isSelected("Native")).toBe(true);
    expect(validationManager.isSelected("Off")).toBe(false);
  });
});

describe("libraryVMToVortex", () => {
  const viewModel = (
    id: string,
    overrides: Partial<vetypes.ModuleViewModel> = {},
  ): vetypes.ModuleViewModel => ({
    moduleInfoExtended: module(id),
    isValid: true,
    isSelected: true,
    isDisabled: false,
    index: 0,
    ...overrides,
  });

  it("links the entry to the Vortex mod that provides the module", () => {
    vi.mocked(getModuleAttributes).mockReturnValue([
      {
        id: "Harmony-2006-2-4-2",
        source: "nexus",
        hasSteamBinariesOnXbox: true,
        hasObfuscatedBinaries: false,
      },
    ]);

    const [result] = libraryVMToVortex(api, [
      viewModel("Bannerlord.Harmony", { index: 3, isSelected: false }),
    ]);

    expect(result).toEqual({
      id: "Bannerlord.Harmony",
      name: "Bannerlord.Harmony name",
      enabled: false,
      modId: "Harmony-2006-2-4-2",
      data: {
        moduleInfoExtended: module("Bannerlord.Harmony"),
        isValid: true,
        isDisabled: false,
        index: 3,
        hasSteamBinariesOnXbox: true,
        hasObfuscatedBinaries: false,
      },
    });
  });

  it("leaves modId out and the binary flags unknown for modules no mod provides", () => {
    const [result] = libraryVMToVortex(api, [viewModel("Native")]);

    expect(result).not.toHaveProperty("modId");
    expect(result?.data?.hasSteamBinariesOnXbox).toBeNull();
    expect(result?.data?.hasObfuscatedBinaries).toBeNull();
  });
});

describe("libraryToVortex", () => {
  it("drops modules that aren't installed and keeps the order", () => {
    const result = libraryToVortex(
      api,
      cache("Native", "SandBox"),
      persistenceToLibrary([
        libraryEntry("SandBox", 0),
        libraryEntry("Uninstalled", 1),
        libraryEntry("Native", 2),
      ]),
    );

    expect(result.map((x) => [x.id, x.data?.index])).toEqual([
      ["SandBox", 0],
      ["Native", 2],
    ]);
  });

  it("marks modules with validation issues invalid", () => {
    failValidationOf("Broken");

    const result = libraryToVortex(
      api,
      cache("Native", "Broken"),
      persistenceToLibrary([
        libraryEntry("Native", 0),
        libraryEntry("Broken", 1, false),
      ]),
    );

    expect(
      result.map((x) => {
        const data = x.data as unknown as {
          isValid: boolean;
          isDisabled: boolean;
        };
        return [x.id, x.enabled, data.isValid, data.isDisabled];
      }),
    ).toEqual([
      ["Native", true, true, false],
      ["Broken", false, false, false],
    ]);
  });

  it("validates with the selection of the saved load order", () => {
    libraryToVortex(
      api,
      cache("Native", "Off"),
      persistenceToLibrary([
        libraryEntry("Native", 0),
        libraryEntry("Off", 1, false),
      ]),
    );

    const [modules, , validationManager] = vi.mocked(
      BannerlordModuleManager.validateModule,
    ).mock.calls[0]!;
    expect(modules.map((x) => x.id)).toEqual(["Native", "Off"]);
    expect(validationManager.isSelected("Native")).toBe(true);
    expect(validationManager.isSelected("Off")).toBe(false);
  });
});

describe("libraryToLibraryVM", () => {
  it("lists the modules unselected", () => {
    const result = libraryToLibraryVM([module("A"), module("B")]);

    expect(result.map((x) => x.moduleInfoExtended.id)).toEqual(["A", "B"]);
    for (const viewModel of result) {
      expect(viewModel).toMatchObject({
        isValid: false,
        isSelected: false,
        isDisabled: false,
      });
    }
  });
});

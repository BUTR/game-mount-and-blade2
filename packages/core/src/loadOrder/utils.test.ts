import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, selectors, types } from "@nexusmods/vortex-api";
import { Utils, types as vetypes } from "@butr/vortexextensionnative";
import {
  filterLoadOrderByGameMode,
  isModuleOfGameMode,
  orderCurrentLoadOrderByExternalLoadOrderAsync,
  toggleLoadOrderAsync,
} from "./utils";
import { bselectors } from "../selectors";
import { VortexLauncherManager } from "../launcher/manager";
import {
  IModuleCache,
  IPersistenceLoadOrderEntry,
  VortexLoadOrderEntry,
} from "../types";
import { GameMode } from "../settings/types";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: { activeProfile: vi.fn() },
  actions: {
    setFBLoadOrder: vi.fn((profileId: string, loadOrder: unknown) => ({
      type: "SET_FB_LOAD_ORDER",
      payload: { profileId, loadOrder },
    })),
  },
}));

vi.mock("@butr/vortexextensionnative", () => ({
  Utils: { isLoadOrderCorrect: vi.fn(() => []) },
  BannerlordModuleManager: { validateModule: vi.fn(() => []) },
}));

vi.mock("../selectors", () => ({
  bselectors: {
    sortOnDeployForProfile: vi.fn(),
    activeGameMode: vi.fn(),
    bannerlordLoadOrder: vi.fn(),
  },
}));

vi.mock("../launcher/manager", () => ({
  VortexLauncherManager: { getInstance: vi.fn() },
}));

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

vi.mock("../vortex/modFinder", () => ({
  getModuleAttributes: () => [],
}));

type ModuleMode = "singleplayer" | "multiplayer" | "both";

const module = (
  id: string,
  mode: ModuleMode = "singleplayer",
): vetypes.ModuleInfoExtendedWithMetadata =>
  ({
    id,
    name: id,
    isSingleplayerModule: mode !== "multiplayer",
    isMultiplayerModule: mode !== "singleplayer",
  }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

const saved = (id: string, isSelected = true): IPersistenceLoadOrderEntry => ({
  id,
  name: id,
  isSelected,
  isDisabled: false,
  index: 0,
});

const viewModel = (
  moduleInfo: vetypes.ModuleInfoExtendedWithMetadata,
  index: number,
  isSelected = true,
): vetypes.ModuleViewModel => ({
  moduleInfoExtended: moduleInfo,
  isValid: true,
  isSelected,
  isDisabled: false,
  index,
});

const cacheOf = (
  ...modules: vetypes.ModuleInfoExtendedWithMetadata[]
): IModuleCache => Object.fromEntries(modules.map((x) => [x.id, x]));

const vortexEntry = (
  id: string,
  moduleInfo?: vetypes.ModuleInfoExtendedWithMetadata,
): VortexLoadOrderEntry =>
  ({
    id,
    name: id,
    enabled: true,
    ...(moduleInfo && {
      data: {
        moduleInfoExtended: moduleInfo,
        index: 0,
        hasSteamBinariesOnXbox: null,
        hasObfuscatedBinaries: null,
      },
    }),
  }) as unknown as VortexLoadOrderEntry;

const NATIVE = module("Native", "both");
const SANDBOX = module("SandBox");
const HARMONY = module("Bannerlord.Harmony");
const MP_ONLY = module("MultiplayerMod", "multiplayer");

const launcherManager = {
  orderByLoadOrderAsync:
    vi.fn<
      (loadOrder: vetypes.LoadOrder) => Promise<vetypes.OrderByLoadOrderResult>
    >(),
  getAllModulesAsync: vi.fn<() => Promise<IModuleCache>>(),
};

const createApi = (): types.IExtensionApi =>
  ({
    getState: () => ({}),
    sendNotification: vi.fn(),
    store: { dispatch: vi.fn() },
  }) as unknown as types.IExtensionApi;

const setup = (
  options: { autoSort?: boolean | null; gameMode?: GameMode } = {},
): void => {
  vi.mocked(selectors.activeProfile).mockReturnValue({
    id: "profile1",
  } as types.IProfile);
  vi.mocked(bselectors.sortOnDeployForProfile).mockReturnValue(
    options.autoSort === undefined ? true : options.autoSort,
  );
  vi.mocked(bselectors.activeGameMode).mockReturnValue(
    options.gameMode ?? "singleplayer",
  );
};

const sorted = (
  ...viewModels: vetypes.ModuleViewModel[]
): vetypes.OrderByLoadOrderResult => ({
  result: true,
  orderedModuleViewModels: viewModels,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(VortexLauncherManager.getInstance).mockReturnValue(
    launcherManager as unknown as VortexLauncherManager,
  );
  vi.mocked(Utils.isLoadOrderCorrect).mockReturnValue([]);
});

describe("isModuleOfGameMode", () => {
  it("lists Native in both modes, whatever its flags say", () => {
    const native = {
      ...module("native", "singleplayer"),
      isSingleplayerModule: false,
    };

    expect(isModuleOfGameMode(native, "singleplayer")).toBe(true);
    expect(isModuleOfGameMode(native, "multiplayer")).toBe(true);
  });

  it("lists a module by the flag of the mode", () => {
    expect(isModuleOfGameMode(SANDBOX, "singleplayer")).toBe(true);
    expect(isModuleOfGameMode(SANDBOX, "multiplayer")).toBe(false);
    expect(isModuleOfGameMode(MP_ONLY, "multiplayer")).toBe(true);
    expect(isModuleOfGameMode(MP_ONLY, "singleplayer")).toBe(false);
  });
});

describe("filterLoadOrderByGameMode", () => {
  it("drops the other mode's modules and keeps entries of modules that aren't installed", () => {
    const loadOrder = [
      vortexEntry("Native", NATIVE),
      vortexEntry("SandBox", SANDBOX),
      vortexEntry("MultiplayerMod", MP_ONLY),
      vortexEntry("Uninstalled"),
    ];

    expect(
      filterLoadOrderByGameMode(loadOrder, "multiplayer").map((x) => x.id),
    ).toEqual(["Native", "MultiplayerMod", "Uninstalled"]);
    expect(
      filterLoadOrderByGameMode(loadOrder, "singleplayer").map((x) => x.id),
    ).toEqual(["Native", "SandBox", "Uninstalled"]);
  });
});

describe("orderCurrentLoadOrderByExternalLoadOrderAsync", () => {
  it("is empty without an active profile", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue(undefined);

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE),
      [saved("Native")],
    );

    expect(result).toEqual([]);
    expect(launcherManager.orderByLoadOrderAsync).not.toHaveBeenCalled();
  });

  it("asks the launcher to order the saved load order", async () => {
    setup();
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(NATIVE, 0)),
    );

    await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, HARMONY),
      [saved("Native"), saved("Bannerlord.Harmony", false)],
    );

    expect(launcherManager.orderByLoadOrderAsync).toHaveBeenCalledWith({
      Native: saved("Native"),
      "Bannerlord.Harmony": saved("Bannerlord.Harmony", false),
    });
  });

  it("with sorting on deploy, uses the launcher's sorted order", async () => {
    setup({ autoSort: true });
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(
        viewModel(HARMONY, 0),
        viewModel(NATIVE, 1),
        viewModel(SANDBOX, 2),
      ),
    );

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, SANDBOX, HARMONY),
      [saved("Native"), saved("SandBox"), saved("Bannerlord.Harmony")],
    );

    expect(result.map((x) => x.id)).toEqual([
      "Bannerlord.Harmony",
      "Native",
      "SandBox",
    ]);
  });

  it("sorts on deploy when the profile has no setting yet", async () => {
    setup({ autoSort: null });
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(HARMONY, 0), viewModel(NATIVE, 1)),
    );

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, HARMONY),
      [saved("Native"), saved("Bannerlord.Harmony")],
    );

    expect(result.map((x) => x.id)).toEqual(["Bannerlord.Harmony", "Native"]);
  });

  it("without sorting on deploy, keeps the saved order and drops modules the launcher doesn't list", async () => {
    setup({ autoSort: false });
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(HARMONY, 0), viewModel(NATIVE, 1)),
    );

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, SANDBOX, HARMONY),
      [saved("Native"), saved("SandBox"), saved("Bannerlord.Harmony", false)],
    );

    expect(result.map((x) => [x.id, x.enabled])).toEqual([
      ["Native", true],
      ["Bannerlord.Harmony", false],
    ]);
  });

  it("without sorting on deploy, appends new modules disabled after the saved ones", async () => {
    setup({ autoSort: false });
    const newModule = module("NewMod");
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(newModule, 0, true), viewModel(NATIVE, 1)),
    );

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, newModule),
      [saved("Native")],
    );

    expect(result.map((x) => [x.id, x.enabled, x.data?.index])).toEqual([
      ["Native", true, 0],
      ["NewMod", false, 1],
    ]);
  });

  it("without sorting on deploy and nothing saved, uses the launcher's order", async () => {
    setup({ autoSort: false });
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(NATIVE, 0), viewModel(SANDBOX, 1)),
    );

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, SANDBOX),
      [],
    );

    expect(result.map((x) => [x.id, x.enabled])).toEqual([
      ["Native", true],
      ["SandBox", true],
    ]);
  });

  it("drops saved modules of the other game mode", async () => {
    setup({ autoSort: false, gameMode: "multiplayer" });
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(NATIVE, 0), viewModel(MP_ONLY, 1)),
    );

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, SANDBOX, MP_ONLY),
      [saved("Native"), saved("SandBox"), saved("MultiplayerMod")],
    );

    expect(result.map((x) => x.id)).toEqual(["Native", "MultiplayerMod"]);
  });

  it("when ordering fails, keeps the saved order, appends the rest and reports the issues", async () => {
    setup({ autoSort: true });
    const api = createApi();
    launcherManager.orderByLoadOrderAsync.mockResolvedValue({
      result: false,
      issues: ["Harmony is missing"],
      orderedModuleViewModels: [viewModel(HARMONY, 0), viewModel(NATIVE, 1)],
    });

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      api,
      cacheOf(NATIVE, HARMONY),
      [saved("Native")],
    );

    expect(result.map((x) => [x.id, x.enabled])).toEqual([
      ["Native", true],
      ["Bannerlord.Harmony", false],
    ]);
    expect(api.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("Harmony is missing"),
      }),
    );
  });

  it("when ordering fails without sorting on deploy, doesn't notify", async () => {
    setup({ autoSort: false });
    const api = createApi();
    launcherManager.orderByLoadOrderAsync.mockResolvedValue({
      result: false,
    });

    const result = await orderCurrentLoadOrderByExternalLoadOrderAsync(
      api,
      cacheOf(NATIVE),
      [saved("Native")],
    );

    expect(result.map((x) => x.id)).toEqual(["Native"]);
    expect(api.sendNotification).not.toHaveBeenCalled();
  });

  it("warns that a saved load order with issues was re-sorted, only when sorting on deploy", async () => {
    vi.mocked(Utils.isLoadOrderCorrect).mockReturnValue(["Wrong order"]);
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(NATIVE, 0)),
    );

    setup({ autoSort: true });
    const sortingApi = createApi();
    await orderCurrentLoadOrderByExternalLoadOrderAsync(
      sortingApi,
      cacheOf(NATIVE),
      [saved("Native")],
    );
    setup({ autoSort: false });
    const keepingApi = createApi();
    await orderCurrentLoadOrderByExternalLoadOrderAsync(
      keepingApi,
      cacheOf(NATIVE),
      [saved("Native")],
    );

    expect(sortingApi.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning" }),
    );
    expect(keepingApi.sendNotification).not.toHaveBeenCalled();
  });

  it("checks only the enabled saved modules for issues", async () => {
    setup({ autoSort: true });
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(NATIVE, 0)),
    );

    await orderCurrentLoadOrderByExternalLoadOrderAsync(
      createApi(),
      cacheOf(NATIVE, HARMONY),
      [saved("Native"), saved("Bannerlord.Harmony", false)],
    );

    expect(Utils.isLoadOrderCorrect).toHaveBeenCalledWith([NATIVE]);
  });
});

describe("toggleLoadOrderAsync", () => {
  it("selects or deselects every module, then stores the ordered result", async () => {
    setup({ autoSort: true });
    const api = createApi();
    vi.mocked(bselectors.bannerlordLoadOrder).mockReturnValue([
      vortexEntry("Native", NATIVE),
      vortexEntry("SandBox", SANDBOX),
    ]);
    launcherManager.getAllModulesAsync.mockResolvedValue(
      cacheOf(NATIVE, SANDBOX),
    );
    launcherManager.orderByLoadOrderAsync.mockResolvedValue(
      sorted(viewModel(NATIVE, 0, false), viewModel(SANDBOX, 1, false)),
    );

    await toggleLoadOrderAsync(api, false);

    const [requested] = launcherManager.orderByLoadOrderAsync.mock.calls[0]!;
    expect(Object.values(requested).map((x) => x.isSelected)).toEqual([
      false,
      false,
    ]);
    expect(actions.setFBLoadOrder).toHaveBeenCalledWith(
      "profile1",
      expect.arrayContaining([
        expect.objectContaining({ id: "Native", enabled: false }),
      ]),
    );
    expect(api.store?.dispatch).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty load order", async () => {
    setup();
    const api = createApi();
    vi.mocked(bselectors.bannerlordLoadOrder).mockReturnValue([]);

    await toggleLoadOrderAsync(api, true);

    expect(launcherManager.orderByLoadOrderAsync).not.toHaveBeenCalled();
    expect(api.store?.dispatch).not.toHaveBeenCalled();
  });
});

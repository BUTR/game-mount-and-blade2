import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, selectors, types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import {
  getAllModuleViewModelsCallback,
  getLoadOrderFromVortex,
  getModuleViewModelsCallback,
  setModuleViewModelsCallback,
} from "./modules";
import { bselectors } from "../../selectors";
import { IModuleCache, VortexLoadOrderEntry } from "../../types";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: { activeProfile: vi.fn() },
  actions: {
    setFBLoadOrder: vi.fn((profileId: string, loadOrder: unknown) => ({
      type: "SET_FB_LOAD_ORDER",
      payload: { profileId, loadOrder },
    })),
  },
}));

const { validator } = vi.hoisted(() => ({
  validator: {
    validateModule: vi.fn<
      (
        target: vetypes.ModuleInfoExtended,
        manager: vetypes.IValidationManager,
      ) => vetypes.ModuleIssue[]
    >(() => []),
    dispose: vi.fn(),
  },
}));

vi.mock("@butr/vortexextensionnative", () => ({
  BannerlordModuleManager: { createValidator: vi.fn(() => validator) },
}));

vi.mock("../../selectors", () => ({
  bselectors: { bannerlordLoadOrder: vi.fn() },
}));

vi.mock("../../vortex/modFinder", () => ({
  getModuleAttributes: () => [],
}));

const dispatch = vi.fn();
const api = {
  getState: () => ({}),
  store: { dispatch },
} as unknown as types.IExtensionApi;

const module = (id: string): vetypes.ModuleInfoExtendedWithMetadata =>
  ({ id, name: id }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

const entry = (id: string, withData = true): VortexLoadOrderEntry =>
  ({
    id,
    name: id,
    enabled: true,
    ...(withData && { data: { moduleInfoExtended: module(id), index: 0 } }),
  }) as unknown as VortexLoadOrderEntry;

beforeEach(() => {
  vi.clearAllMocks();
  validator.validateModule.mockReturnValue([]);
  vi.mocked(selectors.activeProfile).mockReturnValue({
    id: "p1",
  } as types.IProfile);
});

describe("getLoadOrderFromVortex", () => {
  it("is empty without an active profile", () => {
    vi.mocked(selectors.activeProfile).mockReturnValue(undefined);

    expect(getLoadOrderFromVortex(api)).toEqual([]);
  });

  it("is empty when the stored load order isn't a list", () => {
    vi.mocked(bselectors.bannerlordLoadOrder).mockReturnValue(
      {} as unknown as VortexLoadOrderEntry[],
    );

    expect(getLoadOrderFromVortex(api)).toEqual([]);
  });

  it("drops entries without module data or an id", () => {
    vi.mocked(bselectors.bannerlordLoadOrder).mockReturnValue([
      entry("Native"),
      entry("NoData", false),
      entry(""),
      undefined as unknown as VortexLoadOrderEntry,
    ]);

    expect(getLoadOrderFromVortex(api).map((x) => x.id)).toEqual(["Native"]);
  });
});

describe("getAllModuleViewModelsCallback", () => {
  it("adds the modules the load order doesn't show, unselected, before the shown ones", async () => {
    const allModules: IModuleCache = {
      Native: module("Native"),
      SandBox: module("SandBox"),
      New: module("New"),
    };
    const shown: vetypes.ModuleViewModel[] = [
      {
        moduleInfoExtended: module("Native"),
        isValid: true,
        isSelected: true,
        isDisabled: false,
        index: 0,
      },
      {
        moduleInfoExtended: module("SandBox"),
        isValid: true,
        isSelected: true,
        isDisabled: false,
        index: 1,
      },
    ];

    const result = await getAllModuleViewModelsCallback(
      api,
      async () => allModules,
      async () => shown,
    )();

    expect(result?.map((x) => [x.moduleInfoExtended.id, x.isSelected])).toEqual(
      [
        ["New", false],
        ["Native", true],
        ["SandBox", true],
      ],
    );
  });

  it("lists every module unselected when nothing is shown", async () => {
    const result = await getAllModuleViewModelsCallback(
      api,
      async () => ({ Native: module("Native") }),
      async () => null,
    )();

    expect(result?.map((x) => [x.moduleInfoExtended.id, x.isSelected])).toEqual(
      [["Native", false]],
    );
  });
});

describe("getModuleViewModelsCallback", () => {
  it("shows the load order's installed modules, marking the failing ones invalid", async () => {
    vi.mocked(bselectors.bannerlordLoadOrder).mockReturnValue([
      entry("Native"),
      entry("Broken"),
      entry("Uninstalled"),
      entry("NoData", false),
    ]);
    validator.validateModule.mockImplementation((target) =>
      target.id === "Broken"
        ? [{ target } as unknown as vetypes.ModuleIssue]
        : [],
    );
    const allModules: IModuleCache = {
      Native: module("Native"),
      Broken: module("Broken"),
      NoData: module("NoData"),
    };

    const result = await getModuleViewModelsCallback(
      api,
      async () => allModules,
    )();

    expect(
      result?.map((x) => [x.moduleInfoExtended.id, x.isSelected, x.isValid]),
    ).toEqual([
      ["Native", true, true],
      ["Broken", true, false],
    ]);
  });

  it("is empty without an active profile", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue(undefined);

    expect(
      await getModuleViewModelsCallback(api, async () => ({
        Native: module("Native"),
      }))(),
    ).toEqual([]);
  });
});

describe("setModuleViewModelsCallback", () => {
  const viewModel = (
    id: string,
    isSelected: boolean,
    index: number,
  ): vetypes.ModuleViewModel => ({
    moduleInfoExtended: module(id),
    isValid: true,
    isSelected,
    isDisabled: false,
    index,
  });

  it("stores the view models as the active profile's load order", async () => {
    await setModuleViewModelsCallback(api)([
      viewModel("Native", true, 0),
      viewModel("SandBox", false, 1),
    ]);

    expect(actions.setFBLoadOrder).toHaveBeenCalledTimes(1);
    const [profileId, loadOrder] = vi.mocked(actions.setFBLoadOrder).mock
      .calls[0]!;
    expect(profileId).toBe("p1");
    expect(
      (loadOrder as VortexLoadOrderEntry[]).map((x) => [
        x.id,
        x.enabled,
        x.data?.index,
      ]),
    ).toEqual([
      ["Native", true, 0],
      ["SandBox", false, 1],
    ]);
    expect(dispatch).toHaveBeenCalledWith(
      vi.mocked(actions.setFBLoadOrder).mock.results[0]!.value,
    );
  });

  it("stores nothing without an active profile", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue(undefined);

    await setModuleViewModelsCallback(api)([viewModel("Native", true, 0)]);

    expect(dispatch).not.toHaveBeenCalled();
  });
});

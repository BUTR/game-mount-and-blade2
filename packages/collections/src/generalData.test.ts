import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  genCollectionGeneralDataAsync,
  parseCollectionGeneralDataAsync,
} from "./generalData";
import { CollectionParseError } from "./errors";
import { ICollectionData } from "./types";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  PersistenceLoadOrderStorage,
  VortexLoadOrderEntry,
  VortexLoadOrderStorage,
} from "@bannerlord/core/types";

const GAME_ID = "mountandblade2bannerlord";

const mocks = vi.hoisted(() => ({
  profiles: {} as Record<string, { id: string; gameId: string }>,
  lastActiveProfileId: undefined as string | undefined,
  modules: {} as Record<string, unknown>,
  orderLoadOrderAsync:
    vi.fn<
      (
        api: unknown,
        modules: unknown,
        loadOrder: PersistenceLoadOrderStorage,
      ) => Promise<unknown[]>
    >(),
  setUpBLSEAsync: vi.fn<(api: unknown) => Promise<void>>(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  return {
    ...original,
    selectors: {
      lastActiveProfileForGame: (_state: unknown, gameId: string) =>
        gameId === GAME_ID ? mocks.lastActiveProfileId : undefined,
      profileById: (_state: unknown, id: string) => mocks.profiles[id],
      activeProfile: () =>
        mocks.profiles[mocks.lastActiveProfileId ?? ""] ?? undefined,
    },
    actions: {
      setFBLoadOrder: (profileId: string, loadOrder: unknown) => ({
        type: "SET_FB_LOAD_ORDER",
        payload: { profileId, loadOrder },
      }),
    },
  };
});

vi.mock("@bannerlord/core/launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({
      getAllModulesAsync: () => Promise.resolve(mocks.modules),
    }),
  },
}));

vi.mock("@bannerlord/core/loadOrder/utils", () => ({
  orderCurrentLoadOrderByExternalLoadOrderAsync: mocks.orderLoadOrderAsync,
}));

vi.mock("@bannerlord/core/blse/deploy", () => ({
  setUpBLSEAsync: mocks.setUpBLSEAsync,
}));

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (text: string) => text }),
  },
}));

const mod = (id: string, overrides: Partial<IBannerlordMod> = {}) =>
  ({
    id,
    type: "",
    state: "installed",
    attributes: {},
    ...overrides,
  }) as IBannerlordMod;

const storage = (...mods: IBannerlordMod[]): IBannerlordModStorage =>
  Object.fromEntries(mods.map((x) => [x.id, x]));

const entry = (
  id: string,
  modId: string | undefined,
  options: { enabled?: boolean; locked?: VortexLoadOrderEntry["locked"] } = {},
): VortexLoadOrderEntry =>
  ({
    id,
    name: `${id} name`,
    enabled: options.enabled ?? true,
    ...(modId !== undefined && { modId }),
    ...(options.locked !== undefined && { locked: options.locked }),
    data: { moduleInfoExtended: { id }, index: 0 },
  }) as unknown as VortexLoadOrderEntry;

const profile = (modState: Record<string, { enabled: boolean }>) =>
  ({ id: "profile-1", gameId: GAME_ID, modState }) as unknown as types.IProfile;

const createApi = () => {
  const dispatch = vi.fn();
  const sendNotification = vi.fn();
  const api = {
    getState: () => ({}),
    store: { dispatch },
    sendNotification,
  } as unknown as types.IExtensionApi;
  return { api, dispatch, sendNotification };
};

const generalData = (
  data: { hasBLSE?: boolean; suggestedLoadOrder?: PersistenceLoadOrderStorage },
  name?: string,
): ICollectionData =>
  ({
    info: name !== undefined ? { name } : {},
    ...data,
  }) as unknown as ICollectionData;

beforeEach(() => {
  mocks.profiles = { "profile-1": { id: "profile-1", gameId: GAME_ID } };
  mocks.lastActiveProfileId = "profile-1";
  mocks.modules = { "Bannerlord.Harmony": {} };
  mocks.orderLoadOrderAsync.mockReset().mockResolvedValue([]);
  mocks.setUpBLSEAsync.mockReset().mockResolvedValue(undefined);
});

describe("genCollectionGeneralDataAsync", () => {
  it("suggests the load order of the included mods, in order, with their state", async () => {
    const loadOrder: VortexLoadOrderStorage = [
      entry("Native", undefined),
      entry("Bannerlord.Harmony", "harmony-mod", { locked: "always" }),
      entry("NotIncluded", "other-mod"),
      entry("Bannerlord.Diplomacy", "diplomacy-mod", { enabled: false }),
      entry("Locked", "locked-mod", { locked: "true" }),
      entry("Unlocked", "unlocked-mod", { locked: "never" }),
    ];
    const included = storage(
      mod("harmony-mod"),
      mod("diplomacy-mod"),
      mod("locked-mod"),
      mod("unlocked-mod"),
    );

    const result = await genCollectionGeneralDataAsync(
      profile({}),
      loadOrder,
      included,
    );

    expect(result.suggestedLoadOrder).toEqual([
      {
        id: "Native",
        name: "Native name",
        isSelected: true,
        isDisabled: false,
        index: 0,
      },
      {
        id: "Bannerlord.Harmony",
        name: "Bannerlord.Harmony name",
        isSelected: true,
        isDisabled: true,
        index: 1,
      },
      {
        id: "Bannerlord.Diplomacy",
        name: "Bannerlord.Diplomacy name",
        isSelected: false,
        isDisabled: false,
        index: 2,
      },
      {
        id: "Locked",
        name: "Locked name",
        isSelected: true,
        isDisabled: true,
        index: 3,
      },
      {
        id: "Unlocked",
        name: "Unlocked name",
        isSelected: true,
        isDisabled: false,
        index: 4,
      },
    ]);
  });

  it("requires BLSE when an included BLSE mod is enabled", async () => {
    const blse = mod("blse-mod", { type: "bannerlord-blse" });

    const result = await genCollectionGeneralDataAsync(
      profile({ "blse-mod": { enabled: true } }),
      [],
      storage(blse),
    );

    expect(result.hasBLSE).toBe(true);
  });

  it("recognizes BLSE by its Nexus page", async () => {
    const blse = mod("blse-from-nexus", {
      attributes: { modId: 1, source: "nexus" },
    } as Partial<IBannerlordMod>);

    const result = await genCollectionGeneralDataAsync(
      profile({ "blse-from-nexus": { enabled: true } }),
      [],
      storage(blse),
    );

    expect(result.hasBLSE).toBe(true);
  });

  it("doesn't require BLSE when it's disabled, not included or there's no profile", async () => {
    const blse = mod("blse-mod", { type: "bannerlord-blse" });

    const disabled = await genCollectionGeneralDataAsync(
      profile({ "blse-mod": { enabled: false } }),
      [],
      storage(blse),
    );
    const notIncluded = await genCollectionGeneralDataAsync(
      profile({ "blse-mod": { enabled: true } }),
      [],
      storage(mod("harmony-mod")),
    );
    const noProfile = await genCollectionGeneralDataAsync(
      undefined,
      [],
      storage(blse),
    );

    expect([disabled.hasBLSE, notIncluded.hasBLSE, noProfile.hasBLSE]).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("parseCollectionGeneralDataAsync", () => {
  it("applies the suggested load order to the collection's profile", async () => {
    const suggestedLoadOrder: PersistenceLoadOrderStorage = [
      {
        id: "Bannerlord.Harmony",
        name: "Harmony",
        isSelected: true,
        isDisabled: false,
        index: 0,
      },
    ];
    const ordered = [{ id: "Bannerlord.Harmony" }];
    mocks.orderLoadOrderAsync.mockResolvedValue(ordered);
    const { api, dispatch } = createApi();

    await parseCollectionGeneralDataAsync(
      api,
      generalData({ hasBLSE: false, suggestedLoadOrder }),
    );

    expect(mocks.orderLoadOrderAsync).toHaveBeenCalledExactlyOnceWith(
      api,
      mocks.modules,
      suggestedLoadOrder,
    );
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "SET_FB_LOAD_ORDER",
      payload: { profileId: "profile-1", loadOrder: ordered },
    });
    expect(mocks.setUpBLSEAsync).not.toHaveBeenCalled();
  });

  it("sets up BLSE after the load order when the collection requires it", async () => {
    const { api, dispatch } = createApi();

    await parseCollectionGeneralDataAsync(
      api,
      generalData({ hasBLSE: true, suggestedLoadOrder: [] }),
    );

    expect(dispatch).toHaveBeenCalledOnce();
    expect(mocks.setUpBLSEAsync).toHaveBeenCalledExactlyOnceWith(api);
    expect(mocks.orderLoadOrderAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setUpBLSEAsync.mock.invocationCallOrder[0]!,
    );
  });

  it("ignores a collection without general data", async () => {
    const { api, dispatch } = createApi();
    mocks.lastActiveProfileId = undefined;

    await parseCollectionGeneralDataAsync(api, generalData({ hasBLSE: true }));
    await parseCollectionGeneralDataAsync(
      api,
      generalData({ suggestedLoadOrder: [] }),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(mocks.setUpBLSEAsync).not.toHaveBeenCalled();
  });

  it("fails when the game has no last active profile", async () => {
    mocks.lastActiveProfileId = undefined;
    const { api, dispatch } = createApi();

    const promise = parseCollectionGeneralDataAsync(
      api,
      generalData({ hasBLSE: true, suggestedLoadOrder: [] }, "My Collection"),
    );

    await expect(promise).rejects.toBeInstanceOf(CollectionParseError);
    await expect(promise).rejects.toThrow(
      "Failed to parse game specific data for collection My Collection: Last active profile is missing",
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(mocks.setUpBLSEAsync).not.toHaveBeenCalled();
  });

  it("fails when the last active profile belongs to another game, naming an unnamed collection", async () => {
    mocks.profiles = { "profile-1": { id: "profile-1", gameId: "skyrimse" } };
    const { api } = createApi();

    await expect(
      parseCollectionGeneralDataAsync(
        api,
        generalData({ hasBLSE: false, suggestedLoadOrder: [] }),
      ),
    ).rejects.toThrow("for collection Bannerlord Collection:");
  });

  it("round-trips: the exported load order is the one applied on install", async () => {
    const included = storage(mod("harmony-mod"), mod("diplomacy-mod"));
    const exported = await genCollectionGeneralDataAsync(
      profile({}),
      [
        entry("Bannerlord.Harmony", "harmony-mod"),
        entry("Bannerlord.Diplomacy", "diplomacy-mod", { enabled: false }),
      ],
      included,
    );
    const { api } = createApi();

    await parseCollectionGeneralDataAsync(
      api,
      JSON.parse(JSON.stringify({ info: {}, ...exported })) as ICollectionData,
    );

    expect(mocks.orderLoadOrderAsync.mock.calls[0]?.[2]).toEqual(
      exported.suggestedLoadOrder,
    );
    expect(
      (mocks.orderLoadOrderAsync.mock.calls[0]?.[2] ?? []).map((x) => [
        x.id,
        x.isSelected,
      ]),
    ).toEqual([
      ["Bannerlord.Harmony", true],
      ["Bannerlord.Diplomacy", false],
    ]);
  });
});

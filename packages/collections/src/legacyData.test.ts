import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { parseCollectionLegacyDataAsync } from "./legacyData";
import { CollectionParseError } from "./errors";
import { ICollectionData } from "./types";
import {
  IBannerlordMod,
  PersistenceLoadOrderStorage,
} from "@bannerlord/core/types";

const GAME_ID = "mountandblade2bannerlord";

const mocks = vi.hoisted(() => ({
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
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  return {
    ...original,
    selectors: new Proxy(original.selectors, {
      get: (target, property, receiver) =>
        property === "lastActiveProfileForGame"
          ? (_state: unknown, gameId: string) =>
              gameId === GAME_ID ? mocks.lastActiveProfileId : undefined
          : Reflect.get(target, property, receiver),
    }),
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

type LegacyEntry = {
  name?: string;
  pos?: number;
  enabled: boolean;
  locked?: unknown;
};

const legacyCollection = (
  loadOrder?: Record<string, LegacyEntry>,
): ICollectionData =>
  ({
    info: { name: "Old Collection" },
    ...(loadOrder !== undefined && { loadOrder }),
  }) as unknown as ICollectionData;

const createApi = (mods: Record<string, Partial<IBannerlordMod>>) => {
  const dispatch = vi.fn();
  const state = { persistent: { mods: { [GAME_ID]: mods } } };
  const api = {
    getState: () => state,
    store: { dispatch },
  } as unknown as types.IExtensionApi;
  return { api, dispatch };
};

const suggested = (): PersistenceLoadOrderStorage =>
  mocks.orderLoadOrderAsync.mock.calls[0]?.[2] ?? [];

beforeEach(() => {
  mocks.lastActiveProfileId = "profile-1";
  mocks.modules = {};
  mocks.orderLoadOrderAsync.mockReset().mockResolvedValue([]);
});

describe("parseCollectionLegacyDataAsync", () => {
  it("ignores a collection without a legacy load order", async () => {
    const getState = vi.fn();
    const api = { getState } as unknown as types.IExtensionApi;

    await parseCollectionLegacyDataAsync(api, legacyCollection());

    expect(getState).not.toHaveBeenCalled();
  });

  it("migrates the legacy load order to the collection's profile", async () => {
    mocks.modules = { "Bannerlord.Harmony": {}, "Bannerlord.Diplomacy": {} };
    const ordered = [{ id: "Bannerlord.Harmony" }];
    mocks.orderLoadOrderAsync.mockResolvedValue(ordered);
    const { api, dispatch } = createApi({ "some-mod": {} });

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({
        "Bannerlord.Harmony": { name: "Harmony", enabled: true },
        "Bannerlord.Diplomacy": { enabled: false },
      }),
    );

    expect(mocks.orderLoadOrderAsync).toHaveBeenCalledExactlyOnceWith(
      api,
      mocks.modules,
      [
        {
          id: "Bannerlord.Harmony",
          name: "Harmony",
          isSelected: true,
          isDisabled: false,
          index: 0,
        },
        {
          id: "Bannerlord.Diplomacy",
          name: "Bannerlord.Diplomacy",
          isSelected: false,
          isDisabled: false,
          index: 1,
        },
      ],
    );
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "SET_FB_LOAD_ORDER",
      payload: { profileId: "profile-1", loadOrder: ordered },
    });
  });

  it("drops the modules that aren't installed", async () => {
    mocks.modules = { Present: {} };
    const { api } = createApi({ "some-mod": {} });

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({
        Missing: { enabled: true },
        Present: { enabled: true },
      }),
    );

    expect(suggested().map((x) => [x.id, x.index])).toEqual([["Present", 1]]);
  });

  it("expands an entry of a mod to the installed modules of the mod, at the mod's place", async () => {
    mocks.modules = { First: {}, "Pack.A": {}, "Pack.C": {}, Last: {} };
    const { api } = createApi({
      "pack-mod": {
        id: "pack-mod",
        attributes: { subModsIds: ["Pack.A", "Pack.B", "Pack.C"] },
      },
    } as unknown as Record<string, Partial<IBannerlordMod>>);

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({
        First: { enabled: true },
        "pack-mod": { name: "Pack", enabled: true },
        Last: { enabled: true },
      }),
    );

    expect(suggested().map((x) => [x.id, x.name, x.index])).toEqual([
      ["First", "First", 0],
      ["Pack.A", "Pack", 1],
      ["Pack.C", "Pack", 1],
      ["Last", "Last", 2],
    ]);
  });

  it("keeps the entries the legacy load order locked in place", async () => {
    mocks.modules = { A: {}, B: {}, C: {}, D: {} };
    const { api } = createApi({ "some-mod": {} });

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({
        A: { enabled: true, locked: "true" },
        B: { enabled: true, locked: "always" },
        C: { enabled: true, locked: "false" },
        D: { enabled: true, locked: "never" },
      }),
    );

    expect(suggested().map((x) => [x.id, x.isDisabled])).toEqual([
      ["A", true],
      ["B", true],
      ["C", false],
      ["D", false],
    ]);
  });

  it("keeps entries locked with a boolean in place", async () => {
    mocks.modules = { A: {} };
    const { api } = createApi({ "some-mod": {} });

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({ A: { enabled: true, locked: true } }),
    );

    expect(suggested()[0]?.isDisabled).toBe(true);
  });

  it("fails without a last active profile for the game", async () => {
    mocks.lastActiveProfileId = undefined;
    const { api, dispatch } = createApi({ "some-mod": {} });

    const promise = parseCollectionLegacyDataAsync(
      api,
      legacyCollection({ A: { enabled: true } }),
    );

    await expect(promise).rejects.toBeInstanceOf(CollectionParseError);
    await expect(promise).rejects.toThrow("Invalid profile id");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fails when no mods are installed", async () => {
    const { api, dispatch } = createApi({});

    await expect(
      parseCollectionLegacyDataAsync(
        api,
        legacyCollection({ A: { enabled: true } }),
      ),
    ).rejects.toThrow(
      "Failed to parse game specific data for collection Old Collection: No mods were found",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("imports the load order the extension exported with Vortex's first load order API", async () => {
    // Its ILoadOrderEntry: pos and enabled, locked as a boolean, no name, with the extras it carried
    mocks.modules = {
      Native: {},
      "Bannerlord.Harmony": {},
      "Bannerlord.ButterLib": {},
    };
    const { api, dispatch } = createApi({ "some-mod": {} });
    const exported = {
      info: { name: "Old Collection" },
      loadOrder: {
        Native: {
          pos: 0,
          enabled: true,
          locked: true,
          prefix: "",
          external: true,
          data: { id: "Native" },
        },
        "Bannerlord.Harmony": { pos: 1, enabled: true, locked: false },
        "Bannerlord.ButterLib": { pos: 2, enabled: false },
      },
    };

    await parseCollectionLegacyDataAsync(
      api,
      JSON.parse(JSON.stringify(exported)) as ICollectionData,
    );

    expect(suggested()).toEqual([
      {
        id: "Native",
        name: "Native",
        isSelected: true,
        isDisabled: true,
        index: 0,
      },
      {
        id: "Bannerlord.Harmony",
        name: "Bannerlord.Harmony",
        isSelected: true,
        isDisabled: false,
        index: 1,
      },
      {
        id: "Bannerlord.ButterLib",
        name: "Bannerlord.ButterLib",
        isSelected: false,
        isDisabled: false,
        index: 2,
      },
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("orders the old API's entries by their position, not by the key order they were written in", async () => {
    mocks.modules = {
      Native: {},
      "Bannerlord.Harmony": {},
      "Bannerlord.ButterLib": {},
    };
    const { api } = createApi({ "some-mod": {} });

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({
        "Bannerlord.ButterLib": { pos: 2, enabled: true },
        Native: { pos: 0, enabled: true },
        "Bannerlord.Harmony": { pos: 1, enabled: true },
      }),
    );

    expect(suggested().map((x) => [x.id, x.index])).toEqual([
      ["Native", 0],
      ["Bannerlord.Harmony", 1],
      ["Bannerlord.ButterLib", 2],
    ]);
  });

  it("drops the entry of a mod none of whose modules are installed", async () => {
    mocks.modules = { First: {} };
    const { api } = createApi({
      "pack-mod": {
        id: "pack-mod",
        attributes: { subModsIds: ["Pack.A", "Pack.B"] },
      },
    } as unknown as Record<string, Partial<IBannerlordMod>>);

    await parseCollectionLegacyDataAsync(
      api,
      legacyCollection({
        "pack-mod": { name: "Pack", enabled: true },
        First: { enabled: true },
      }),
    );

    expect(suggested().map((x) => x.id)).toEqual(["First"]);
  });
});

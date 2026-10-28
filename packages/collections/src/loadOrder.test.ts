import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  genCollectionGeneralLoadOrder,
  parseCollectionGeneralLoadOrderAsync,
} from "./loadOrder";
import { CollectionParseError } from "./errors";
import { ICollectionDataWithGeneralData } from "./types";
import {
  IBannerlordMod,
  PersistenceLoadOrderStorage,
  VortexLoadOrderEntry,
} from "@bannerlord/core/types";

const GAME_ID = "mountandblade2bannerlord";

const mocks = vi.hoisted(() => ({
  lastActiveProfileId: undefined as string | undefined,
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
    // util.testModReference stays the stub's, the generation matches the collection's rules with it
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

vi.mock("@bannerlord/core/loadOrder/utils", () => ({
  orderCurrentLoadOrderByExternalLoadOrderAsync: mocks.orderLoadOrderAsync,
}));

const HARMONY_MOD_ID = "Harmony-2006-2-4-2-1780065784";
const DIPLOMACY_MOD_ID = "Diplomacy 832 1.5.5 2026-10-23T14-54Z VqSEze7OA";

const mod = (id: string, nexusModId: number): IBannerlordMod =>
  ({
    id,
    type: "",
    state: "installed",
    attributes: { modId: nexusModId },
  }) as unknown as IBannerlordMod;

const entry = (
  id: string,
  options: { modId?: string; enabled?: boolean; withData?: boolean } = {},
): VortexLoadOrderEntry =>
  ({
    id,
    name: id,
    enabled: options.enabled ?? true,
    ...(options.modId !== undefined && { modId: options.modId }),
    ...(options.withData !== false && {
      data: {
        moduleInfoExtended: { id, name: id },
        index: 0,
        hasSteamBinariesOnXbox: null,
        hasObfuscatedBinaries: null,
      },
    }),
  }) as unknown as VortexLoadOrderEntry;

describe("genCollectionGeneralLoadOrder", () => {
  it("keeps the entries of included mods, matched by their Vortex mod id", () => {
    const loadOrder = [
      entry("Bannerlord.Harmony", { modId: HARMONY_MOD_ID }),
      entry("Bannerlord.Diplomacy", { modId: DIPLOMACY_MOD_ID }),
    ];
    const mods = [mod(HARMONY_MOD_ID, 2006), mod(DIPLOMACY_MOD_ID, 832)];

    const result = genCollectionGeneralLoadOrder(loadOrder, mods);

    expect(result.map((x) => x.id)).toEqual([
      "Bannerlord.Harmony",
      "Bannerlord.Diplomacy",
    ]);
  });

  it("drops the entries of mods that are not included", () => {
    const loadOrder = [
      entry("Bannerlord.Harmony", { modId: HARMONY_MOD_ID }),
      entry("Bannerlord.Diplomacy", { modId: DIPLOMACY_MOD_ID }),
    ];

    const result = genCollectionGeneralLoadOrder(loadOrder, [
      mod(HARMONY_MOD_ID, 2006),
    ]);

    expect(result.map((x) => x.id)).toEqual(["Bannerlord.Harmony"]);
  });

  it("never matches an entry by the Nexus mod id", () => {
    // The regression: the entry's modId is the Vortex mod id, a Nexus id compare matches nothing
    const loadOrder = [entry("Bannerlord.Harmony", { modId: "2006" })];

    const result = genCollectionGeneralLoadOrder(loadOrder, [
      mod(HARMONY_MOD_ID, 2006),
    ]);

    expect(result).toEqual([]);
  });

  it("keeps entries without a mod only when they are enabled and have module data", () => {
    const loadOrder = [
      entry("Native"),
      entry("StoryMode", { enabled: false }),
      entry("Ghost", { withData: false }),
    ];

    const result = genCollectionGeneralLoadOrder(loadOrder, []);

    expect(result.map((x) => x.id)).toEqual(["Native"]);
  });

  it("drops collection mods themselves", () => {
    const collection = {
      ...mod("collection_abc_1", 0),
      type: "collection",
    } as IBannerlordMod;
    const loadOrder = [entry("SomeModule", { modId: collection.id })];

    expect(genCollectionGeneralLoadOrder(loadOrder, [collection])).toEqual([]);
  });

  it("with a collection mod, keeps only the mods its rules reference", () => {
    const loadOrder = [
      entry("Bannerlord.Harmony", { modId: HARMONY_MOD_ID }),
      entry("Bannerlord.Diplomacy", { modId: DIPLOMACY_MOD_ID }),
    ];
    const mods = [mod(HARMONY_MOD_ID, 2006), mod(DIPLOMACY_MOD_ID, 832)];
    const collectionMod = {
      id: "collection_abc_1",
      type: "collection",
      rules: [{ type: "requires", reference: { id: HARMONY_MOD_ID } }],
    } as unknown as types.IMod;

    const result = genCollectionGeneralLoadOrder(
      loadOrder,
      mods,
      collectionMod,
    );

    expect(result.map((x) => x.id)).toEqual(["Bannerlord.Harmony"]);
  });

  it("with a collection mod without rules, keeps no mod entries", () => {
    const loadOrder = [
      entry("Native"),
      entry("Bannerlord.Harmony", { modId: HARMONY_MOD_ID }),
    ];
    const collectionMod = {
      id: "collection_abc_1",
      type: "collection",
    } as unknown as types.IMod;

    const result = genCollectionGeneralLoadOrder(
      loadOrder,
      [mod(HARMONY_MOD_ID, 2006)],
      collectionMod,
    );

    expect(result.map((x) => x.id)).toEqual(["Native"]);
  });

  it("preserves the order of the entries", () => {
    const ids = ["C", "A", "B"];
    const loadOrder = ids.map((id) => entry(id, { modId: `${id}-mod` }));
    const mods = ids.map((id) => mod(`${id}-mod`, 1));

    const result = genCollectionGeneralLoadOrder(loadOrder, mods);

    expect(result.map((x) => x.id)).toEqual(ids);
  });
});

describe("parseCollectionGeneralLoadOrderAsync", () => {
  const modules = { "Bannerlord.Harmony": {} };
  const suggestedLoadOrder: PersistenceLoadOrderStorage = [
    {
      id: "Bannerlord.Harmony",
      name: "Harmony",
      isSelected: true,
      isDisabled: false,
      index: 0,
    },
  ];
  const collection = {
    info: { name: "My Collection" },
    hasBLSE: false,
    suggestedLoadOrder,
  } as unknown as ICollectionDataWithGeneralData;

  const createApi = () => {
    const dispatch = vi.fn();
    const api = {
      getState: () => ({}),
      store: { dispatch },
    } as unknown as types.IExtensionApi;
    return { api, dispatch };
  };

  beforeEach(() => {
    mocks.lastActiveProfileId = "profile-1";
    mocks.orderLoadOrderAsync.mockReset().mockResolvedValue([]);
  });

  it("orders the suggested load order over the installed modules and applies it to the game's profile", async () => {
    const ordered = [{ id: "Bannerlord.Harmony", enabled: true }];
    mocks.orderLoadOrderAsync.mockResolvedValue(ordered);
    const { api, dispatch } = createApi();

    await parseCollectionGeneralLoadOrderAsync(
      api,
      modules as never,
      collection,
    );

    expect(mocks.orderLoadOrderAsync).toHaveBeenCalledExactlyOnceWith(
      api,
      modules,
      suggestedLoadOrder,
    );
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "SET_FB_LOAD_ORDER",
      payload: { profileId: "profile-1", loadOrder: ordered },
    });
  });

  it("fails before ordering anything without a last active profile for the game", async () => {
    mocks.lastActiveProfileId = undefined;
    const { api, dispatch } = createApi();

    const promise = parseCollectionGeneralLoadOrderAsync(
      api,
      modules as never,
      collection,
    );

    await expect(promise).rejects.toBeInstanceOf(CollectionParseError);
    await expect(promise).rejects.toThrow(
      "Failed to parse game specific data for collection My Collection: Invalid profile id",
    );
    expect(mocks.orderLoadOrderAsync).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

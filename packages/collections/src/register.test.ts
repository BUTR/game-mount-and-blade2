import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { registerCollections } from "./register";
import { ICollectionData } from "./types";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  VortexLoadOrderStorage,
} from "@bannerlord/core/types";

const GAME_ID = "mountandblade2bannerlord";

const mocks = vi.hoisted(() => ({
  activeProfile: undefined as { id: string } | undefined,
  genCollectionGeneralDataAsync:
    vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  parseCollectionGeneralDataAsync:
    vi.fn<(...args: unknown[]) => Promise<void>>(),
  cloneCollectionGeneralDataAsync:
    vi.fn<(...args: unknown[]) => Promise<void>>(),
  genCollectionModOptionsDataAsync:
    vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  parseCollectionModOptionsDataAsync:
    vi.fn<(...args: unknown[]) => Promise<void>>(),
  cloneCollectionModOptionsDataAsync:
    vi.fn<(...args: unknown[]) => Promise<void>>(),
  parseCollectionLegacyDataAsync:
    vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  return {
    ...original,
    selectors: new Proxy(original.selectors, {
      get: (target, property, receiver) =>
        property === "activeProfile"
          ? () => mocks.activeProfile
          : Reflect.get(target, property, receiver),
    }),
  };
});

vi.mock("./generalData", () => ({
  genCollectionGeneralDataAsync: mocks.genCollectionGeneralDataAsync,
  parseCollectionGeneralDataAsync: mocks.parseCollectionGeneralDataAsync,
  cloneCollectionGeneralDataAsync: mocks.cloneCollectionGeneralDataAsync,
}));

vi.mock("./modOptionsData", () => ({
  genCollectionModOptionsDataAsync: mocks.genCollectionModOptionsDataAsync,
  parseCollectionModOptionsDataAsync: mocks.parseCollectionModOptionsDataAsync,
  cloneCollectionModOptionsDataAsync: mocks.cloneCollectionModOptionsDataAsync,
}));

vi.mock("./legacyData", () => ({
  parseCollectionLegacyDataAsync: mocks.parseCollectionLegacyDataAsync,
}));

// The pages are React views, the registration only hands them over
vi.mock("./views/CollectionGeneralData/GeneralDataPage", () => ({
  BannerlordGeneralDataPage: "GeneralDataPage",
}));
vi.mock("./views/CollectionModOptionsData/ModOptionsDataPage", () => ({
  ModOptionsDataPage: "ModOptionsDataPage",
}));

interface IFeature {
  generate: (
    gameId: string,
    includedModIds: string[],
    mod: types.IMod,
  ) => Promise<unknown>;
  parse: (
    gameId: string,
    collection: ICollectionData,
    mod: types.IMod,
  ) => Promise<void>;
  clone: (
    gameId: string,
    collection: ICollectionData,
    from: types.IMod,
    to: types.IMod,
  ) => Promise<void>;
  title: (t: (key: string) => string) => string;
  condition: (state: unknown, gameId: string) => boolean;
  editComponent: unknown;
}

const LOAD_ORDER = `${GAME_ID}_load_order`;
const MOD_OPTIONS = `${GAME_ID}_mod_options`;

const mod = (id: string): IBannerlordMod =>
  ({ id, type: "", state: "installed", attributes: {} }) as IBannerlordMod;

const collectionMod = { id: "collection-1", type: "collection" } as types.IMod;
const otherMod = { id: "collection-2", type: "collection" } as types.IMod;
const collection = { info: { name: "My Collection" } } as ICollectionData;

const register = (
  options: {
    withFeature?: boolean;
    mods?: IBannerlordModStorage;
    loadOrder?: VortexLoadOrderStorage;
  } = {},
) => {
  const state = {
    persistent: {
      loadOrder: { "profile-1": options.loadOrder ?? [] },
      mods: { [GAME_ID]: options.mods ?? {} },
    },
  };
  const features = new Map<string, IFeature>();
  const registerCollectionFeature = vi.fn((...args: unknown[]) => {
    const [id, generate, parse, clone, title, condition, editComponent] =
      args as [
        string,
        IFeature["generate"],
        IFeature["parse"],
        IFeature["clone"],
        IFeature["title"],
        IFeature["condition"],
        unknown,
      ];
    features.set(id, {
      generate,
      parse,
      clone,
      title,
      condition,
      editComponent,
    });
  });
  const api = { getState: () => state } as unknown as types.IExtensionApi;
  const context = {
    api,
    optional:
      options.withFeature === false ? {} : { registerCollectionFeature },
  } as unknown as types.IExtensionContext;

  registerCollections(context);

  const feature = (id: string): IFeature => {
    const found = features.get(id);
    if (found === undefined) {
      throw new Error(`The ${id} feature wasn't registered`);
    }
    return found;
  };
  return { api, state, features, feature };
};

beforeEach(() => {
  mocks.activeProfile = { id: "profile-1" };
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function") {
      mock.mockReset();
    }
  }
  mocks.genCollectionGeneralDataAsync.mockResolvedValue({
    hasBLSE: false,
    suggestedLoadOrder: [],
  });
  mocks.genCollectionModOptionsDataAsync.mockResolvedValue({
    includedModOptions: [],
  });
});

describe("registerCollections", () => {
  it("registers nothing when the collections extension isn't installed", () => {
    const { features } = register({ withFeature: false });

    expect(features.size).toBe(0);
  });

  it("registers the load order and the mod options features, for the game only", () => {
    const { features, feature } = register();

    expect([...features.keys()]).toEqual([LOAD_ORDER, MOD_OPTIONS]);
    for (const id of [LOAD_ORDER, MOD_OPTIONS]) {
      expect(feature(id).condition({}, GAME_ID)).toBe(true);
      expect(feature(id).condition({}, "skyrimse")).toBe(false);
    }
    const t = (key: string): string => `t:${key}`;
    expect(feature(LOAD_ORDER).title(t)).toBe("t:Requirements & Load Order");
    expect(feature(MOD_OPTIONS).title(t)).toBe("t:Mod Options");
    expect(feature(LOAD_ORDER).editComponent).toBe("GeneralDataPage");
    expect(feature(MOD_OPTIONS).editComponent).toBe("ModOptionsDataPage");
  });
});

describe("the load order feature", () => {
  it("generates the data from the profile's load order and the included mods that are installed", async () => {
    const loadOrder = [{ id: "Native" }] as unknown as VortexLoadOrderStorage;
    const harmony = mod("harmony-mod");
    const diplomacy = mod("diplomacy-mod");
    const { feature } = register({
      loadOrder,
      mods: {
        "harmony-mod": harmony,
        "diplomacy-mod": diplomacy,
        "other-mod": mod("other-mod"),
      },
    });
    const data = { hasBLSE: true, suggestedLoadOrder: [] };
    mocks.genCollectionGeneralDataAsync.mockResolvedValue(data);

    const result = await feature(LOAD_ORDER).generate(
      GAME_ID,
      ["harmony-mod", "diplomacy-mod", "not-installed-mod"],
      collectionMod,
    );

    expect(result).toBe(data);
    expect(mocks.genCollectionGeneralDataAsync).toHaveBeenCalledExactlyOnceWith(
      mocks.activeProfile,
      loadOrder,
      {
        "harmony-mod": harmony,
        "diplomacy-mod": diplomacy,
      },
    );
  });

  it("generates nothing for another game or without an active profile", async () => {
    const { feature } = register({
      mods: { "harmony-mod": mod("harmony-mod") },
    });

    const otherGame = await feature(LOAD_ORDER).generate(
      "skyrimse",
      ["harmony-mod"],
      collectionMod,
    );
    mocks.activeProfile = undefined;
    const noProfile = await feature(LOAD_ORDER).generate(
      GAME_ID,
      ["harmony-mod"],
      collectionMod,
    );

    expect([otherGame, noProfile]).toEqual([{}, {}]);
    expect(mocks.genCollectionGeneralDataAsync).not.toHaveBeenCalled();
  });

  it("parses the legacy load order before the general data", async () => {
    const { api, feature } = register();

    await feature(LOAD_ORDER).parse(GAME_ID, collection, collectionMod);

    expect(
      mocks.parseCollectionLegacyDataAsync,
    ).toHaveBeenCalledExactlyOnceWith(api, collection);
    expect(
      mocks.parseCollectionGeneralDataAsync,
    ).toHaveBeenCalledExactlyOnceWith(api, collection);
    expect(mocks.parseCollectionLegacyDataAsync).toHaveBeenCalledBefore(
      mocks.parseCollectionGeneralDataAsync,
    );
  });

  it("clones the general data to the new collection", async () => {
    const { api, feature } = register();

    await feature(LOAD_ORDER).clone(
      GAME_ID,
      collection,
      collectionMod,
      otherMod,
    );

    expect(
      mocks.cloneCollectionGeneralDataAsync,
    ).toHaveBeenCalledExactlyOnceWith(
      api,
      GAME_ID,
      collection,
      collectionMod,
      otherMod,
    );
  });

  it("leaves another game's collections alone", async () => {
    const { feature } = register();

    await feature(LOAD_ORDER).parse("skyrimse", collection, collectionMod);
    await feature(LOAD_ORDER).clone(
      "skyrimse",
      collection,
      collectionMod,
      otherMod,
    );

    expect(mocks.parseCollectionLegacyDataAsync).not.toHaveBeenCalled();
    expect(mocks.parseCollectionGeneralDataAsync).not.toHaveBeenCalled();
    expect(mocks.cloneCollectionGeneralDataAsync).not.toHaveBeenCalled();
  });
});

describe("the mod options feature", () => {
  it("generates the data from the collection mod", async () => {
    const { api, feature } = register();
    const data = { includedModOptions: [{ name: "MCM_v5.json" }] };
    mocks.genCollectionModOptionsDataAsync.mockResolvedValue(data);

    const result = await feature(MOD_OPTIONS).generate(
      GAME_ID,
      ["harmony-mod"],
      collectionMod,
    );

    expect(result).toBe(data);
    expect(
      mocks.genCollectionModOptionsDataAsync,
    ).toHaveBeenCalledExactlyOnceWith(api, collectionMod);
  });

  it("parses and clones the mod options of the collection", async () => {
    const { api, feature } = register();

    await feature(MOD_OPTIONS).parse(GAME_ID, collection, collectionMod);
    await feature(MOD_OPTIONS).clone(
      GAME_ID,
      collection,
      collectionMod,
      otherMod,
    );

    expect(
      mocks.parseCollectionModOptionsDataAsync,
    ).toHaveBeenCalledExactlyOnceWith(api, collection, collectionMod);
    expect(
      mocks.cloneCollectionModOptionsDataAsync,
    ).toHaveBeenCalledExactlyOnceWith(
      api,
      GAME_ID,
      collection,
      collectionMod,
      otherMod,
    );
  });

  it("leaves another game's collections alone", async () => {
    const { feature } = register();

    const generated = await feature(MOD_OPTIONS).generate(
      "skyrimse",
      [],
      collectionMod,
    );
    await feature(MOD_OPTIONS).parse("skyrimse", collection, collectionMod);
    await feature(MOD_OPTIONS).clone(
      "skyrimse",
      collection,
      collectionMod,
      otherMod,
    );

    expect(generated).toEqual({});
    expect(mocks.genCollectionModOptionsDataAsync).not.toHaveBeenCalled();
    expect(mocks.parseCollectionModOptionsDataAsync).not.toHaveBeenCalled();
    expect(mocks.cloneCollectionModOptionsDataAsync).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  cloneCollectionModOptionsDataAsync,
  genCollectionModOptionsDataAsync,
  parseCollectionModOptionsDataAsync,
} from "./modOptionsData";
import { ICollectionData } from "./types";
import {
  ModOptionsEntryType,
  ModOptionsStorage,
  PersistentModOptionsEntry,
} from "./modOptions/types";

const mocks = vi.hoisted(() => ({
  getGlobalSettingsAsync: vi.fn<() => Promise<ModOptionsStorage>>(),
  overrideModOptionsAsync:
    vi.fn<
      (mod: unknown, modOptions: PersistentModOptionsEntry[]) => Promise<void>
    >(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  return {
    ...original,
    actions: {
      setModAttribute: (...args: unknown[]) => ({
        type: "SET_MOD_ATTRIBUTE",
        payload: args,
      }),
    },
  };
});

// Native, comes with Vortex
vi.mock("turbowalk", () => ({ default: vi.fn() }));

vi.mock("./modOptions/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./modOptions/utils")>()),
  getGlobalSettingsAsync: mocks.getGlobalSettingsAsync,
  overrideModOptionsAsync: mocks.overrideModOptionsAsync,
}));

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (text: string) => text }),
  },
}));

const option = (
  name: string,
  type = ModOptionsEntryType.Global,
): PersistentModOptionsEntry => ({
  name,
  path: name,
  type,
  contentBase64: "e30=",
});

const collectionData = (
  includedModOptions?: PersistentModOptionsEntry[],
): ICollectionData =>
  ({
    info: { name: "My Collection" },
    ...(includedModOptions !== undefined && { includedModOptions }),
  }) as unknown as ICollectionData;

const collectionMod = (collection?: object): types.IMod =>
  ({
    id: "collection-1",
    type: "collection",
    attributes: collection !== undefined ? { collection } : {},
  }) as unknown as types.IMod;

const createApi = (answer?: string) => {
  const dispatch = vi.fn();
  const showDialog = vi.fn(() =>
    Promise.resolve(answer !== undefined ? { action: answer } : undefined),
  );
  const api = {
    store: { dispatch },
    showDialog,
  } as unknown as types.IExtensionApi;
  return { api, dispatch, showDialog };
};

beforeEach(() => {
  mocks.getGlobalSettingsAsync.mockReset().mockResolvedValue({});
  mocks.overrideModOptionsAsync.mockReset().mockResolvedValue(undefined);
});

describe("genCollectionModOptionsDataAsync", () => {
  it("exports the mod options the curator included", async () => {
    const included = [option("MCM_v5.json")];
    const { api } = createApi();

    await expect(
      genCollectionModOptionsDataAsync(
        api,
        collectionMod({ includedModOptions: included }),
      ),
    ).resolves.toEqual({ includedModOptions: included });
  });

  it("exports none when the curator never picked any", async () => {
    const { api } = createApi();

    await expect(
      genCollectionModOptionsDataAsync(api, collectionMod({})),
    ).resolves.toEqual({ includedModOptions: [] });
    await expect(
      genCollectionModOptionsDataAsync(api, collectionMod()),
    ).resolves.toEqual({ includedModOptions: [] });
  });
});

describe("cloneCollectionModOptionsDataAsync", () => {
  it("keeps only the options that exist on this machine and saves them on the new collection", async () => {
    mocks.getGlobalSettingsAsync.mockResolvedValue({
      MCM_v5: {
        name: "MCM_v5.json",
        path: "MCM_v5.json",
        type: ModOptionsEntryType.Global,
      },
    });
    const { api, dispatch } = createApi();
    const to = collectionMod({ other: 1 });

    await cloneCollectionModOptionsDataAsync(
      api,
      "mountandblade2bannerlord",
      collectionData([
        option("MCM_v5.json"),
        option("Missing_v1.json"),
        option("ButterLib/Options.json", ModOptionsEntryType.Special),
      ]),
      collectionMod(),
      to,
    );

    const expected = {
      other: 1,
      includedModOptions: [
        option("MCM_v5.json"),
        option("ButterLib/Options.json", ModOptionsEntryType.Special),
      ],
    };
    expect(to.attributes?.["collection"]).toEqual(expected);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "SET_MOD_ATTRIBUTE",
      payload: [
        "mountandblade2bannerlord",
        "collection-1",
        "collection",
        expected,
      ],
    });
  });

  it("does nothing for a collection without mod options", async () => {
    const { api, dispatch } = createApi();
    const to = collectionMod({});

    await cloneCollectionModOptionsDataAsync(
      api,
      "mountandblade2bannerlord",
      collectionData(),
      collectionMod(),
      to,
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(to.attributes?.["collection"]).toEqual({});
  });

  it("does nothing when the new mod has no collection attribute", async () => {
    const { api, dispatch } = createApi();

    await cloneCollectionModOptionsDataAsync(
      api,
      "mountandblade2bannerlord",
      collectionData([option("MCM_v5.json")]),
      collectionMod(),
      collectionMod(),
    );

    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("parseCollectionModOptionsDataAsync", () => {
  it("overrides the user's mod options when they agree", async () => {
    const included = [option("MCM_v5.json")];
    const mod = collectionMod();
    const { api, showDialog } = createApi("Yes");

    await parseCollectionModOptionsDataAsync(
      api,
      collectionData(included),
      mod,
    );

    expect(showDialog).toHaveBeenCalledOnce();
    expect(mocks.overrideModOptionsAsync).toHaveBeenCalledExactlyOnceWith(
      mod,
      included,
    );
  });

  it("keeps the user's mod options when they decline or close the dialog", async () => {
    for (const answer of ["No", undefined]) {
      const { api } = createApi(answer);

      await parseCollectionModOptionsDataAsync(
        api,
        collectionData([option("MCM_v5.json")]),
        collectionMod(),
      );
    }

    expect(mocks.overrideModOptionsAsync).not.toHaveBeenCalled();
  });

  it("doesn't ask when the collection has no mod options", async () => {
    for (const included of [undefined, []]) {
      const { api, showDialog } = createApi("Yes");

      await parseCollectionModOptionsDataAsync(
        api,
        collectionData(included),
        collectionMod(),
      );

      expect(showDialog).not.toHaveBeenCalled();
    }
    expect(mocks.overrideModOptionsAsync).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { selectors, types } from "@nexusmods/vortex-api";
import {
  findInstalledCollection,
  getCollectionLookupKey,
  getCollectionPageUrl,
  ICollectionRevisionInfo,
  installCollectionAsync,
  isCollectionInstalling,
  lookupCollectionAsync,
} from "./collections";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  class UserCanceled extends Error {}
  return {
    ...(await importOriginal<object>()),
    util: { UserCanceled },
    selectors: {} as Record<string, unknown>,
  };
});

const SLUG = "abcd1234";

const apiWithRevision = (getRevision: unknown): types.IExtensionApi =>
  ({
    ext: { nexusGetCollectionRevision: getRevision },
  }) as unknown as types.IExtensionApi;

const collectionMod = (
  id: string,
  attributes: Record<string, unknown>,
  overrides: Partial<types.IMod> = {},
): types.IMod =>
  ({
    id,
    type: "collection",
    state: "installed",
    attributes: { collectionSlug: SLUG, ...attributes },
    ...overrides,
  }) as unknown as types.IMod;

describe("getCollectionLookupKey", () => {
  it("tells revisions apart and names the latest", () => {
    expect(
      getCollectionLookupKey({ slug: SLUG, revision: 4, required: true }),
    ).toBe("abcd1234:4");
    expect(
      getCollectionLookupKey({ slug: SLUG, revision: null, required: true }),
    ).toBe("abcd1234:latest");
  });
});

describe("getCollectionPageUrl", () => {
  it("links the collection on Nexus Mods", () => {
    expect(getCollectionPageUrl(SLUG)).toBe(
      "https://www.nexusmods.com/games/mountandblade2bannerlord/collections/abcd1234",
    );
  });
});

describe("lookupCollectionAsync", () => {
  it("fails without Vortex's Nexus Mods integration", async () => {
    expect(
      await lookupCollectionAsync({} as types.IExtensionApi, {
        slug: SLUG,
        revision: 1,
        required: true,
      }),
    ).toEqual({
      state: "failed",
      revision: null,
      error: "The Nexus Mods integration is not available",
    });
  });

  it("asks for revision 0 to get the latest", async () => {
    const getRevision = vi.fn(async () => undefined);

    await lookupCollectionAsync(apiWithRevision(getRevision), {
      slug: SLUG,
      revision: null,
      required: true,
    });

    expect(getRevision).toHaveBeenCalledWith(SLUG, 0);
  });

  it("describes the revision Nexus Mods found", async () => {
    const getRevision = vi.fn(async () => ({
      id: 900,
      revisionNumber: 3,
      latest: true,
      modCount: 12,
      collection: {
        id: 77,
        slug: SLUG,
        name: "Server Pack",
        user: { name: "Author" },
        game: { domainName: "mountandblade2bannerlord" },
      },
    }));

    expect(
      await lookupCollectionAsync(apiWithRevision(getRevision), {
        slug: SLUG,
        revision: 3,
        required: true,
      }),
    ).toEqual({
      state: "found",
      revision: {
        collectionId: 77,
        revisionId: 900,
        revisionNumber: 3,
        slug: SLUG,
        name: "Server Pack",
        author: "Author",
        gameDomain: "mountandblade2bannerlord",
        modCount: 12,
        latest: true,
      },
      error: null,
    });
  });

  it("fills what Nexus Mods leaves out", async () => {
    const getRevision = vi.fn(async () => ({
      id: 900,
      revisionNumber: 3,
      collectionId: 77,
      modFiles: [{}, {}],
    }));

    const lookup = await lookupCollectionAsync(apiWithRevision(getRevision), {
      slug: SLUG,
      revision: 3,
      required: true,
    });

    expect(lookup.revision).toEqual({
      collectionId: 77,
      revisionId: 900,
      revisionNumber: 3,
      slug: SLUG,
      name: SLUG,
      author: null,
      gameDomain: null,
      modCount: 2,
      latest: false,
    });
  });

  it("is not found when Nexus Mods has no such revision", async () => {
    expect(
      await lookupCollectionAsync(
        apiWithRevision(async () => undefined),
        { slug: SLUG, revision: 99, required: true },
      ),
    ).toEqual({ state: "not-found", revision: null, error: null });
  });

  it("fails with the error the request threw", async () => {
    expect(
      await lookupCollectionAsync(
        apiWithRevision(async () => {
          throw new Error("Rate limited");
        }),
        { slug: SLUG, revision: 1, required: true },
      ),
    ).toEqual({ state: "failed", revision: null, error: "Rate limited" });
  });
});

describe("lookupCollectionAsync failures", () => {
  it("describes a rejection that isn't an Error", async () => {
    expect(
      await lookupCollectionAsync(
        apiWithRevision(async () => {
          throw "offline";
        }),
        { slug: SLUG, revision: 1, required: true },
      ),
    ).toEqual({ state: "failed", revision: null, error: "offline" });
  });
});

describe("isCollectionInstalling", () => {
  const state = {} as types.IState;

  it("is false on Vortex versions without the selector", () => {
    expect(isCollectionInstalling(state)).toBe(false);
  });

  it("asks Vortex when it has the selector", () => {
    const vortexSelectors = selectors as Record<string, unknown>;
    vortexSelectors["hasCollectionActiveSession"] = () => true;
    try {
      expect(isCollectionInstalling(state)).toBe(true);
    } finally {
      delete vortexSelectors["hasCollectionActiveSession"];
    }
  });
});

describe("findInstalledCollection", () => {
  it("finds the highest installed revision of the collection, with its enabled state", () => {
    const mods = {
      r2: collectionMod("r2", { revisionNumber: 2 }),
      r5: collectionMod("r5", { revisionNumber: "5" }),
      r3: collectionMod("r3", { revisionNumber: 3 }),
    };
    const profile = {
      modState: { r5: { enabled: true } },
    } as unknown as types.IProfile;

    expect(findInstalledCollection(mods, profile, SLUG)).toEqual({
      modId: "r5",
      revisionNumber: 5,
      enabled: true,
    });
  });

  it("ignores other collections, other mod types and unfinished installs", () => {
    const mods = {
      other: collectionMod("other", { collectionSlug: "zzzz9999" }),
      plain: collectionMod("plain", {}, { type: "" }),
      installing: collectionMod("installing", {}, { state: "installing" }),
    };

    expect(findInstalledCollection(mods, undefined, SLUG)).toBeNull();
    expect(findInstalledCollection(undefined, undefined, SLUG)).toBeNull();
  });

  it("has no revision number when it wasn't stored, and isn't enabled without a profile", () => {
    expect(
      findInstalledCollection(
        { c: collectionMod("c", { revisionNumber: "abc" }) },
        undefined,
        SLUG,
      ),
    ).toEqual({ modId: "c", revisionNumber: null, enabled: false });
  });
});

describe("installCollectionAsync", () => {
  const revision: ICollectionRevisionInfo = {
    collectionId: 77,
    revisionId: 900,
    revisionNumber: 3,
    slug: SLUG,
    name: "Server Pack",
    author: null,
    gameDomain: null,
    modCount: null,
    latest: true,
  };

  const apiAnswering = (error: Error | null) => {
    const emit = vi.fn((...args: unknown[]) => {
      const callback = args[4] as (err: Error | null) => void;
      callback(error);
    });
    return {
      api: { events: { emit } } as unknown as types.IExtensionApi,
      emit,
    };
  };

  it("starts the collection download the way Vortex's Install does", async () => {
    const { api, emit } = apiAnswering(null);

    await installCollectionAsync(api, revision);

    expect(emit).toHaveBeenCalledWith(
      "start-download",
      ["nxm://mountandblade2bannerlord/collections/abcd1234/revisions/3"],
      {
        game: "mountandblade2bannerlord",
        source: "nexus",
        name: "Server Pack",
        nexus: {
          ids: {
            gameId: "mountandblade2bannerlord",
            collectionId: 77,
            revisionId: 900,
            collectionSlug: SLUG,
            revisionNumber: 3,
          },
        },
      },
      undefined,
      expect.any(Function),
      undefined,
      { allowInstall: "force" },
    );
  });

  it("treats the user cancelling as done", async () => {
    const { util } = await import("@nexusmods/vortex-api");
    const { api } = apiAnswering(new util.UserCanceled());

    await expect(
      installCollectionAsync(api, revision),
    ).resolves.toBeUndefined();
  });

  it("rejects with a download error", async () => {
    const { api } = apiAnswering(new Error("Download failed"));

    await expect(installCollectionAsync(api, revision)).rejects.toThrow(
      "Download failed",
    );
  });
});

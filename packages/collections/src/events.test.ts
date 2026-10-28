import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { willRemoveModCollectionsAsync } from "./events";

const GAME_ID = "mountandblade2bannerlord";

const mocks = vi.hoisted(() => ({
  hasBackupModOptionsAsync: vi.fn<(mod: unknown) => Promise<boolean>>(),
  removeOriginalModOptionsAsync: vi.fn<(mod: unknown) => Promise<void>>(),
  restoreOriginalModOptionsAsync: vi.fn<(mod: unknown) => Promise<void>>(),
}));

vi.mock("./modOptions/utils", () => mocks);

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (text: string) => text }),
  },
}));

const COLLECTION = { id: "collection-1", type: "collection", attributes: {} };
const MOD = { id: "mod-1", type: "", attributes: {} };

const createApi = (answer?: string) => {
  const showDialog = vi.fn(() =>
    Promise.resolve(answer !== undefined ? { action: answer } : undefined),
  );
  const state = {
    persistent: {
      mods: { [GAME_ID]: { [COLLECTION.id]: COLLECTION, [MOD.id]: MOD } },
    },
  };
  const api = {
    getState: () => state,
    showDialog,
  } as unknown as types.IExtensionApi;
  return { api, showDialog };
};

beforeEach(() => {
  mocks.hasBackupModOptionsAsync.mockReset().mockResolvedValue(true);
  mocks.removeOriginalModOptionsAsync.mockReset().mockResolvedValue(undefined);
  mocks.restoreOriginalModOptionsAsync.mockReset().mockResolvedValue(undefined);
});

describe("willRemoveModCollectionsAsync", () => {
  it("restores the user's mod options when they choose to", async () => {
    const { api } = createApi("Restore Originals");

    await willRemoveModCollectionsAsync(api, COLLECTION.id);

    expect(
      mocks.restoreOriginalModOptionsAsync,
    ).toHaveBeenCalledExactlyOnceWith(COLLECTION);
    expect(mocks.removeOriginalModOptionsAsync).not.toHaveBeenCalled();
  });

  it("deletes the backups when they choose to keep the collection's options", async () => {
    const { api } = createApi("Delete Originals");

    await willRemoveModCollectionsAsync(api, COLLECTION.id);

    expect(mocks.removeOriginalModOptionsAsync).toHaveBeenCalledExactlyOnceWith(
      COLLECTION,
    );
    expect(mocks.restoreOriginalModOptionsAsync).not.toHaveBeenCalled();
  });

  it("leaves everything as is when cancelled or dismissed", async () => {
    for (const answer of ["Cancel", undefined]) {
      const { api, showDialog } = createApi(answer);

      await willRemoveModCollectionsAsync(api, COLLECTION.id);

      expect(showDialog).toHaveBeenCalledOnce();
    }
    expect(mocks.removeOriginalModOptionsAsync).not.toHaveBeenCalled();
    expect(mocks.restoreOriginalModOptionsAsync).not.toHaveBeenCalled();
  });

  it("doesn't ask when the collection overrode no mod options", async () => {
    mocks.hasBackupModOptionsAsync.mockResolvedValue(false);
    const { api, showDialog } = createApi("Restore Originals");

    await willRemoveModCollectionsAsync(api, COLLECTION.id);

    expect(showDialog).not.toHaveBeenCalled();
    expect(mocks.restoreOriginalModOptionsAsync).not.toHaveBeenCalled();
  });

  it("doesn't ask for a mod that isn't a collection, or one that's unknown", async () => {
    const { api, showDialog } = createApi("Restore Originals");

    await willRemoveModCollectionsAsync(api, MOD.id);
    await willRemoveModCollectionsAsync(api, "unknown");

    expect(mocks.hasBackupModOptionsAsync).not.toHaveBeenCalled();
    expect(showDialog).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  collectionInstallBLSEAsync,
  hasCollectionWithModOptions,
  hasContextWithCollectionFeature,
  hasIncludedModOptions,
} from "./utils";

const mocks = vi.hoisted(() => ({
  activeProfile: undefined as { id: string } | undefined,
  setUpBLSEAsync: vi.fn<(api: unknown) => Promise<void>>(),
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

vi.mock("@bannerlord/core/blse/deploy", () => ({
  setUpBLSEAsync: mocks.setUpBLSEAsync,
}));

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (text: string) => text }),
  },
}));

const mod = (attributes?: object): types.IMod =>
  ({
    id: "collection-1",
    ...(attributes !== undefined && { attributes }),
  }) as unknown as types.IMod;

beforeEach(() => {
  mocks.activeProfile = { id: "profile-1" };
  mocks.setUpBLSEAsync.mockReset().mockResolvedValue(undefined);
});

describe("hasContextWithCollectionFeature", () => {
  it("is true only when the collections extension registered its feature hook", () => {
    const withFeature = {
      optional: { registerCollectionFeature: () => undefined },
    } as unknown as types.IExtensionContext;
    const without = { optional: {} } as unknown as types.IExtensionContext;

    expect(hasContextWithCollectionFeature(withFeature)).toBe(true);
    expect(hasContextWithCollectionFeature(without)).toBe(false);
  });
});

describe("hasCollectionWithModOptions and hasIncludedModOptions", () => {
  it.each([
    ["no attributes", undefined, false, false],
    ["no collection", {}, false, false],
    ["a null collection", { collection: null }, false, false],
    ["a collection without options", { collection: {} }, true, false],
    [
      "a collection with options",
      { collection: { includedModOptions: [] } },
      true,
      true,
    ],
  ])("a mod with %s", (_, attributes, hasCollection, hasOptions) => {
    expect(hasCollectionWithModOptions(mod(attributes))).toBe(hasCollection);
    expect(hasIncludedModOptions(mod(attributes))).toBe(hasOptions);
  });
});

describe("collectionInstallBLSEAsync", () => {
  it("sets up BLSE for the active profile", async () => {
    const sendNotification = vi.fn();
    const api = {
      getState: () => ({}),
      sendNotification,
    } as unknown as types.IExtensionApi;

    await collectionInstallBLSEAsync(api);

    expect(mocks.setUpBLSEAsync).toHaveBeenCalledExactlyOnceWith(api);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "blse-required", type: "info" }),
    );
  });

  it("reports an error and sets nothing up without an active profile", async () => {
    mocks.activeProfile = undefined;
    const sendNotification = vi.fn();
    const api = {
      getState: () => ({}),
      sendNotification,
    } as unknown as types.IExtensionApi;

    await collectionInstallBLSEAsync(api);

    expect(mocks.setUpBLSEAsync).not.toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "blse-required-no-profile",
        type: "error",
      }),
    );
  });
});

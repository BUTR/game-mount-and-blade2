import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { gamemodeActivatedSaveAsync } from "./events";

const mocks = vi.hoisted(() => ({
  reloadSaveAsync: vi.fn<(api: unknown) => Promise<void>>(),
}));

vi.mock("./utils", () => ({ reloadSaveAsync: mocks.reloadSaveAsync }));

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (text: string) => text }),
  },
}));

const createApi = () => {
  const showErrorNotification = vi.fn();
  const api = { showErrorNotification } as unknown as types.IExtensionApi;
  return { api, showErrorNotification };
};

beforeEach(() => {
  mocks.reloadSaveAsync.mockReset().mockResolvedValue(undefined);
});

describe("gamemodeActivatedSaveAsync", () => {
  it("reloads the profile's save", async () => {
    const { api, showErrorNotification } = createApi();

    await gamemodeActivatedSaveAsync(api);

    expect(mocks.reloadSaveAsync).toHaveBeenCalledExactlyOnceWith(api);
    expect(showErrorNotification).not.toHaveBeenCalled();
  });

  it("reports instead of throwing when the save can't be reloaded, it's an event handler", async () => {
    const error = new Error("Active profile is undefined");
    mocks.reloadSaveAsync.mockRejectedValue(error);
    const { api, showErrorNotification } = createApi();

    await expect(gamemodeActivatedSaveAsync(api)).resolves.toBeUndefined();

    expect(showErrorNotification).toHaveBeenCalledExactlyOnceWith(
      "Failed to reload the save",
      error,
    );
  });
});

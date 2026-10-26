import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { actionsSave } from "./actions";
import { reloadSaveAsync } from "./utils";

const mocks = vi.hoisted(() => ({
  activeProfile: vi.fn<() => unknown>(),
  setSaveFileAsync: vi.fn<(save: string) => Promise<void>>(),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  selectors: { activeProfile: mocks.activeProfile },
}));

vi.mock("@bannerlord/core/launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({ setSaveFileAsync: mocks.setSaveFileAsync }),
  },
}));

const createApi = (saveName: Record<string, string | null>) => {
  const dispatch = vi.fn();
  const api = {
    getState: () => ({ settings: { [GAME_ID]: { saveName } } }),
    store: { dispatch },
  } as unknown as types.IExtensionApi;
  return { api, dispatch };
};

describe("reloadSaveAsync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.activeProfile.mockReturnValue({ id: "profile1" });
  });

  it("sets the profile's save in the state and the launcher", async () => {
    const { api, dispatch } = createApi({ profile1: "Campaign" });

    await reloadSaveAsync(api);

    expect(dispatch).toHaveBeenCalledWith(
      actionsSave.setCurrentSave("profile1", "Campaign"),
    );
    expect(mocks.setSaveFileAsync).toHaveBeenCalledWith("Campaign");
  });

  it("clears the save of a profile without one", async () => {
    const { api, dispatch } = createApi({ profile1: "No Save" });

    await reloadSaveAsync(api);

    expect(dispatch).toHaveBeenCalledWith(
      actionsSave.setCurrentSave("profile1", null),
    );
    expect(mocks.setSaveFileAsync).toHaveBeenCalledWith("");
  });

  it("rejects without an active profile", async () => {
    mocks.activeProfile.mockReturnValue(undefined);
    const { api } = createApi({});

    await expect(reloadSaveAsync(api)).rejects.toThrow(
      "Active profile is undefined",
    );
    expect(mocks.setSaveFileAsync).not.toHaveBeenCalled();
  });
});

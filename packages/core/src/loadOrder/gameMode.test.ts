import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import {
  changeProfileGameModeAsync,
  reloadLoadOrderAsync,
  watchActiveProfileType,
} from "./gameMode";
import { LoadOrderManager } from "./manager";
import { bselectors } from "../selectors";
import {
  applyGameModeTools,
  rememberPrimaryTool,
} from "../vortex/gameModeTools";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
} from "../common";
import { GameMode } from "../settings/types";

vi.mock("@nexusmods/vortex-api", () => {
  class ProcessCanceled extends Error {}
  return {
    selectors: {
      profileById: vi.fn(),
      activeProfile: vi.fn(),
      activeGameId: vi.fn(),
    },
    actions: {
      setFeature: vi.fn(
        (profileId: string, feature: string, value: unknown) => ({
          type: "SET_FEATURE",
          payload: { profileId, feature, value },
        }),
      ),
      setFBLoadOrder: vi.fn((profileId: string, loadOrder: unknown) => ({
        type: "SET_FB_LOAD_ORDER",
        payload: { profileId, loadOrder },
      })),
    },
    util: { ProcessCanceled },
  };
});

vi.mock("./manager", () => ({
  LoadOrderManager: { getInstance: vi.fn() },
}));

vi.mock("../selectors", () => ({
  bselectors: { gameModeForProfile: vi.fn(), activeGameMode: vi.fn() },
}));

vi.mock("../vortex/gameModeTools", () => ({
  applyGameModeTools: vi.fn(),
  rememberPrimaryTool: vi.fn(),
}));

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const deserializeLoadOrder = vi.fn();

type StateListener = () => void;

const createApi = (): types.IExtensionApi & {
  fire: (path: string) => void;
} => {
  const listeners = new Map<string, StateListener[]>();
  return {
    getState: () => ({}),
    store: { dispatch: vi.fn() },
    showErrorNotification: vi.fn(),
    onStateChange: (path: string[], listener: StateListener) => {
      const key = path.join(".");
      listeners.set(key, [...(listeners.get(key) ?? []), listener]);
    },
    fire: (path: string) => {
      for (const listener of listeners.get(path) ?? []) {
        listener();
      }
    },
  } as unknown as types.IExtensionApi & { fire: (path: string) => void };
};

const profile = (
  id: string,
  features: Record<string, unknown> = {},
): types.IProfile => ({ id, gameId: GAME_ID, features }) as types.IProfile;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(LoadOrderManager.getInstance).mockReturnValue({
    deserializeLoadOrder,
  } as unknown as LoadOrderManager);
  deserializeLoadOrder.mockResolvedValue([]);
  vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
});

describe("changeProfileGameModeAsync", () => {
  it("stores the mode as the profile's multiplayer feature", async () => {
    const api = createApi();
    vi.mocked(selectors.profileById).mockReturnValue(profile("p1"));
    vi.mocked(bselectors.gameModeForProfile).mockReturnValue("singleplayer");

    await changeProfileGameModeAsync(api, "p1", "multiplayer");

    expect(actions.setFeature).toHaveBeenCalledWith(
      "p1",
      MULTIPLAYER_PROFILE_FEATURE,
      true,
    );
    expect(api.store?.dispatch).toHaveBeenCalledTimes(1);
  });

  it("remembers the primary tool only when the profile is active", async () => {
    const api = createApi();
    vi.mocked(selectors.profileById).mockReturnValue(profile("p1"));
    vi.mocked(bselectors.gameModeForProfile).mockReturnValue("multiplayer");

    vi.mocked(selectors.activeProfile).mockReturnValue(profile("p2"));
    await changeProfileGameModeAsync(api, "p1", "singleplayer");
    expect(rememberPrimaryTool).not.toHaveBeenCalled();

    vi.mocked(selectors.activeProfile).mockReturnValue(profile("p1"));
    await changeProfileGameModeAsync(api, "p1", "singleplayer");
    expect(rememberPrimaryTool).toHaveBeenCalledTimes(1);
    expect(actions.setFeature).toHaveBeenLastCalledWith(
      "p1",
      MULTIPLAYER_PROFILE_FEATURE,
      false,
    );
  });

  it("does nothing when the profile already has the mode", async () => {
    const api = createApi();
    vi.mocked(selectors.profileById).mockReturnValue(profile("p1"));
    vi.mocked(bselectors.gameModeForProfile).mockReturnValue("multiplayer");

    await changeProfileGameModeAsync(api, "p1", "multiplayer");

    expect(api.store?.dispatch).not.toHaveBeenCalled();
  });

  it("keeps the No Mods profile multiplayer", async () => {
    const api = createApi();
    vi.mocked(selectors.profileById).mockReturnValue(
      profile("p1", { [NO_MODS_PROFILE_FEATURE]: true }),
    );
    vi.mocked(bselectors.gameModeForProfile).mockReturnValue("multiplayer");

    await changeProfileGameModeAsync(api, "p1", "singleplayer");

    expect(api.store?.dispatch).not.toHaveBeenCalled();
  });

  it("does nothing for an unknown profile", async () => {
    const api = createApi();
    vi.mocked(selectors.profileById).mockReturnValue(
      undefined as unknown as types.IProfile,
    );

    await changeProfileGameModeAsync(api, "missing", "multiplayer");

    expect(api.store?.dispatch).not.toHaveBeenCalled();
  });
});

describe("watchActiveProfileType", () => {
  let activeProfileId: string | undefined;
  let activeMode: GameMode;

  beforeEach(() => {
    activeProfileId = "p1";
    activeMode = "singleplayer";
    vi.mocked(selectors.activeProfile).mockImplementation(() =>
      activeProfileId === undefined ? undefined : profile(activeProfileId),
    );
    vi.mocked(bselectors.activeGameMode).mockImplementation(() => activeMode);
  });

  it("swaps the tools and reloads the load order when the active profile's mode changes", async () => {
    const api = createApi();
    watchActiveProfileType(api);

    activeMode = "multiplayer";
    api.fire("persistent.profiles");
    await vi.waitFor(() => expect(api.store?.dispatch).toHaveBeenCalled());

    expect(applyGameModeTools).toHaveBeenCalledTimes(1);
    expect(deserializeLoadOrder).toHaveBeenCalledTimes(1);
  });

  it("ignores profile changes that keep the mode", () => {
    const api = createApi();
    watchActiveProfileType(api);

    api.fire("persistent.profiles");

    expect(applyGameModeTools).not.toHaveBeenCalled();
  });

  it("leaves a profile switch to the profile switch", () => {
    const api = createApi();
    watchActiveProfileType(api);

    activeProfileId = "p2";
    activeMode = "multiplayer";
    api.fire("persistent.profiles");

    expect(applyGameModeTools).not.toHaveBeenCalled();
  });

  it("compares against the profile that became active, not the one before it", () => {
    const api = createApi();
    watchActiveProfileType(api);

    activeProfileId = "p2";
    activeMode = "multiplayer";
    api.fire("settings.profiles.activeProfileId");
    activeMode = "singleplayer";
    api.fire("persistent.profiles");

    expect(applyGameModeTools).toHaveBeenCalledTimes(1);
  });

  it("ignores changes while another game is managed", () => {
    vi.mocked(selectors.activeGameId).mockReturnValue("skyrimse");
    const api = createApi();
    watchActiveProfileType(api);

    activeMode = "multiplayer";
    api.fire("persistent.profiles");

    expect(applyGameModeTools).not.toHaveBeenCalled();
  });

  it("reports a failed reload", async () => {
    deserializeLoadOrder.mockRejectedValue(new Error("broken"));
    const api = createApi();
    watchActiveProfileType(api);

    activeMode = "multiplayer";
    api.fire("persistent.profiles");

    await vi.waitFor(() =>
      expect(api.showErrorNotification).toHaveBeenCalledTimes(1),
    );
  });
});

describe("reloadLoadOrderAsync", () => {
  it("stores the read load order on the active profile", async () => {
    const loadOrder = [{ id: "Native" }];
    deserializeLoadOrder.mockResolvedValue(loadOrder);
    vi.mocked(selectors.activeProfile).mockReturnValue(profile("p1"));
    const api = createApi();

    await reloadLoadOrderAsync(api);

    expect(actions.setFBLoadOrder).toHaveBeenCalledWith("p1", loadOrder);
  });

  it("drops a read canceled by a switch without an error", async () => {
    deserializeLoadOrder.mockRejectedValue(new util.ProcessCanceled("switch"));
    vi.mocked(selectors.activeProfile).mockReturnValue(profile("p1"));
    const api = createApi();

    await expect(reloadLoadOrderAsync(api)).resolves.toBeUndefined();
    expect(api.store?.dispatch).not.toHaveBeenCalled();
  });

  it("passes other read failures on", async () => {
    deserializeLoadOrder.mockRejectedValue(new Error("broken"));
    vi.mocked(selectors.activeProfile).mockReturnValue(profile("p1"));

    await expect(reloadLoadOrderAsync(createApi())).rejects.toThrow("broken");
  });
});

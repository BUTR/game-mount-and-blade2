import { beforeEach, describe, expect, it, vi } from "vitest";
import { types, util } from "@nexusmods/vortex-api";
import { profilesOfGameMode, switchGameModeAsync } from "./switch";
import { createProfileAsync, switchProfileAsync } from "../vortex/profiles";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { IStateWithBannerlord } from "../types";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  class UserCanceled extends Error {}
  Object.assign(api.util, { UserCanceled });
  Object.assign(api.selectors, {
    activeProfile: (state: {
      settings: { profiles: { activeProfileId?: string } };
      persistent: { profiles: Record<string, unknown> };
    }) => {
      const id = state.settings.profiles.activeProfileId;
      return id !== undefined ? state.persistent.profiles[id] : undefined;
    },
  });
  return api;
});
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));
vi.mock("../vortex/profiles", () => ({
  createProfileAsync: vi.fn(() => Promise.resolve({ id: "created" })),
  switchProfileAsync: vi.fn(() => Promise.resolve()),
}));

const profile = (
  id: string,
  gameMode: "singleplayer" | "multiplayer",
  options: {
    lastActivated?: number;
    gameId?: string;
    pendingRemove?: boolean;
  } = {},
) => ({
  id,
  name: `${id} name`,
  gameId: options.gameId ?? GAME_ID,
  modState: { [`${id}-mod`]: { enabled: true } },
  features: { [MULTIPLAYER_PROFILE_FEATURE]: gameMode === "multiplayer" },
  ...(options.lastActivated !== undefined && {
    lastActivated: options.lastActivated,
  }),
  ...(options.pendingRemove !== undefined && {
    pendingRemove: options.pendingRemove,
  }),
});

const stateWith = (
  profiles: ReturnType<typeof profile>[],
  activeProfileId?: string,
): IStateWithBannerlord =>
  ({
    persistent: {
      profiles: Object.fromEntries(profiles.map((p) => [p.id, p])),
    },
    settings: { profiles: { activeProfileId } },
  }) as unknown as IStateWithBannerlord;

type DialogResult = { action: string; input: Record<string, unknown> };

const makeApi = (state: IStateWithBannerlord, dialogResult?: DialogResult) => {
  const api = {
    getState: () => state,
    showDialog: vi.fn(() => Promise.resolve(dialogResult)),
    showErrorNotification: vi.fn(),
  };
  return api;
};

const run = async (
  api: ReturnType<typeof makeApi>,
  gameMode: "singleplayer" | "multiplayer",
) => switchGameModeAsync(api as unknown as types.IExtensionApi, gameMode);

beforeEach(() => {
  vi.mocked(createProfileAsync).mockClear();
  vi.mocked(switchProfileAsync).mockReset();
  vi.mocked(switchProfileAsync).mockResolvedValue(undefined);
});

describe("profilesOfGameMode", () => {
  it("lists the game's profiles of the type, the most recently used first", () => {
    const state = stateWith([
      profile("never", "multiplayer"),
      profile("old", "multiplayer", { lastActivated: 100 }),
      profile("recent", "multiplayer", { lastActivated: 300 }),
      profile("sp", "singleplayer", { lastActivated: 500 }),
      profile("removing", "multiplayer", {
        lastActivated: 400,
        pendingRemove: true,
      }),
      profile("skyrim", "multiplayer", {
        lastActivated: 400,
        gameId: "skyrimse",
      }),
    ]);

    expect(profilesOfGameMode(state, "multiplayer").map((p) => p.id)).toEqual([
      "recent",
      "old",
      "never",
    ]);
  });
});

describe("switchGameModeAsync", () => {
  it("does nothing when the active profile already has the type", async () => {
    const api = makeApi(
      stateWith(
        [profile("sp", "singleplayer"), profile("mp", "multiplayer")],
        "sp",
      ),
    );

    await run(api, "singleplayer");

    expect(api.showDialog).not.toHaveBeenCalled();
    expect(switchProfileAsync).not.toHaveBeenCalled();
  });

  it("does nothing without an active Bannerlord profile", async () => {
    const api = makeApi(
      stateWith(
        [
          profile("skyrim", "singleplayer", { gameId: "skyrimse" }),
          profile("mp", "multiplayer"),
        ],
        "skyrim",
      ),
    );

    await run(api, "multiplayer");
    await run(
      makeApi(stateWith([profile("mp", "multiplayer")])),
      "multiplayer",
    );

    expect(switchProfileAsync).not.toHaveBeenCalled();
  });

  it("switches straight to the only profile of the type", async () => {
    const api = makeApi(
      stateWith(
        [profile("sp", "singleplayer"), profile("mp", "multiplayer")],
        "sp",
      ),
    );

    await run(api, "multiplayer");

    expect(api.showDialog).not.toHaveBeenCalled();
    expect(switchProfileAsync).toHaveBeenCalledWith(api, "mp");
  });

  it("switches to the profile picked from several, offering the most recent first", async () => {
    const api = makeApi(
      stateWith(
        [
          profile("sp", "singleplayer"),
          profile("mp1", "multiplayer", { lastActivated: 1 }),
          profile("mp2", "multiplayer", { lastActivated: 2 }),
        ],
        "sp",
      ),
      { action: "Switch", input: { mp1: true, mp2: false } },
    );

    await run(api, "multiplayer");

    const content = (api.showDialog.mock.calls[0] as unknown[])[2] as {
      choices: { id: string; value: boolean }[];
    };
    expect(content.choices.map((choice) => [choice.id, choice.value])).toEqual([
      ["mp2", true],
      ["mp1", false],
      ["bannerlord-new-profile", false],
    ]);
    expect(switchProfileAsync).toHaveBeenCalledWith(api, "mp1");
    expect(createProfileAsync).not.toHaveBeenCalled();
  });

  it("creates a profile of the type, copying the mods when asked", async () => {
    const api = makeApi(stateWith([profile("sp", "singleplayer")], "sp"), {
      action: "Switch",
      input: {
        "bannerlord-new-profile": true,
        "bannerlord-new-profile-name": "  Online  ",
        "bannerlord-copy-mods": true,
      },
    });

    await run(api, "multiplayer");

    expect(createProfileAsync).toHaveBeenCalledWith(
      api,
      "Online",
      { [MULTIPLAYER_PROFILE_FEATURE]: true },
      { "sp-mod": { enabled: true } },
    );
    expect(switchProfileAsync).toHaveBeenCalledWith(api, "created");
  });

  it("creates an empty profile unless asked to copy the mods", async () => {
    const api = makeApi(stateWith([profile("mp", "multiplayer")], "mp"), {
      action: "Switch",
      input: {
        "bannerlord-new-profile": true,
        "bannerlord-new-profile-name": "Campaign",
        "bannerlord-copy-mods": false,
      },
    });

    await run(api, "singleplayer");

    expect(createProfileAsync).toHaveBeenCalledWith(
      api,
      "Campaign",
      { [MULTIPLAYER_PROFILE_FEATURE]: false },
      {},
    );
  });

  it("asks for a name before creating a profile", async () => {
    const api = makeApi(stateWith([profile("sp", "singleplayer")], "sp"));

    await run(api, "multiplayer");

    const content = (api.showDialog.mock.calls[0] as unknown[])[2] as {
      condition: (content: unknown) => unknown[];
    };
    const check = (creating: boolean, name: string) =>
      content.condition({
        choices: [{ id: "bannerlord-new-profile", value: creating }],
        input: [{ id: "bannerlord-new-profile-name", value: name }],
      });
    expect(check(true, "   ")).toHaveLength(1);
    expect(check(true, "Online")).toEqual([]);
    expect(check(false, "")).toEqual([]);
  });

  it("does nothing when the dialog is canceled", async () => {
    const api = makeApi(stateWith([profile("sp", "singleplayer")], "sp"), {
      action: "Cancel",
      input: { "bannerlord-new-profile": true },
    });

    await run(api, "multiplayer");

    expect(createProfileAsync).not.toHaveBeenCalled();
    expect(switchProfileAsync).not.toHaveBeenCalled();
  });

  it("reports a failed switch, but not one the user canceled", async () => {
    const state = stateWith(
      [profile("sp", "singleplayer"), profile("mp", "multiplayer")],
      "sp",
    );
    const canceled = makeApi(state);
    vi.mocked(switchProfileAsync).mockRejectedValueOnce(
      new util.UserCanceled(),
    );
    await run(canceled, "multiplayer");

    const failed = makeApi(state);
    vi.mocked(switchProfileAsync).mockRejectedValueOnce(new Error("boom"));
    await run(failed, "multiplayer");

    expect(canceled.showErrorNotification).not.toHaveBeenCalled();
    expect(failed.showErrorNotification).toHaveBeenCalledTimes(1);
  });
});

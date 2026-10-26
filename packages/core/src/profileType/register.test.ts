import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { registerProfileType } from "./register";
import { changeProfileGameModeAsync } from "../loadOrder/gameMode";
import { switchGameModeAsync } from "./switch";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
} from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  type State = {
    settings: { profiles: { activeProfileId?: string } };
    persistent: { profiles: Record<string, { gameId: string }> };
  };
  const profileById = (state: State, id: string) =>
    state.persistent.profiles[id];
  const activeProfile = (state: State) => {
    const id = state.settings.profiles.activeProfileId;
    return id !== undefined ? profileById(state, id) : undefined;
  };
  Object.assign(api.selectors, {
    profileById,
    activeProfile,
    activeGameId: (state: State) => activeProfile(state)?.gameId,
  });
  return api;
});
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../loadOrder/gameMode", () => ({
  changeProfileGameModeAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("./switch", () => ({
  switchGameModeAsync: vi.fn(() => Promise.resolve()),
}));

type Condition = (instanceIds?: string[]) => boolean;
type Action = (instanceIds?: string[]) => void;

const profile = (
  id: string,
  features: Record<string, unknown>,
  gameId = GAME_ID,
) => ({ id, gameId, features });

const register = (
  profiles: ReturnType<typeof profile>[],
  activeProfileId?: string,
) => {
  const state = {
    persistent: {
      profiles: Object.fromEntries(profiles.map((p) => [p.id, p])),
    },
    settings: { profiles: { activeProfileId } },
  };
  const actions = new Map<string, { action: Action; condition: Condition }>();
  const context = {
    api: { getState: () => state },
    registerProfileFeature: () => undefined,
    registerAction: (
      _group: string,
      _position: number,
      _icon: string,
      _options: unknown,
      title: string,
      action: Action,
      condition: Condition,
    ) => actions.set(title, { action, condition }),
  } as unknown as types.IExtensionContext;
  registerProfileType(context);
  return (title: string) => actions.get(title)!;
};

const sp = profile("sp", { [MULTIPLAYER_PROFILE_FEATURE]: false });
const mp = profile("mp", { [MULTIPLAYER_PROFILE_FEATURE]: true });
const noMods = profile("noMods", {
  [MULTIPLAYER_PROFILE_FEATURE]: true,
  [NO_MODS_PROFILE_FEATURE]: true,
});
const skyrim = profile("skyrim", {}, "skyrimse");

describe("profile card actions", () => {
  it("offers changing a profile only to the other type", () => {
    const action = register([sp, mp]);

    expect(action("Change to Multiplayer").condition(["sp"])).toBe(true);
    expect(action("Change to Singleplayer").condition(["sp"])).toBe(false);
    expect(action("Change to Singleplayer").condition(["mp"])).toBe(true);
    expect(action("Change to Multiplayer").condition(["mp"])).toBe(false);
  });

  it("never offers changing the shared profile of servers without mods", () => {
    expect(
      register([noMods])("Change to Singleplayer").condition(["noMods"]),
    ).toBe(false);
  });

  it("offers nothing for other games' or unknown profiles", () => {
    const action = register([skyrim]);

    expect(action("Change to Multiplayer").condition(["skyrim"])).toBe(false);
    expect(action("Change to Multiplayer").condition(["missing"])).toBe(false);
    expect(action("Change to Multiplayer").condition([])).toBe(false);
    expect(action("Change to Multiplayer").condition()).toBe(false);
  });

  it("changes the profile it is on", () => {
    register([sp])("Change to Multiplayer").action(["sp"]);

    expect(changeProfileGameModeAsync).toHaveBeenCalledWith(
      expect.anything(),
      "sp",
      "multiplayer",
    );
  });
});

describe("game tile actions", () => {
  it("offers switching to the other type on the managed game's tile", () => {
    const action = register([sp, mp], "sp");

    expect(action("Switch to Multiplayer").condition([GAME_ID])).toBe(true);
    expect(action("Switch to Singleplayer").condition([GAME_ID])).toBe(false);
  });

  it("offers nothing on other games' tiles or while another game is managed", () => {
    expect(
      register([sp], "sp")("Switch to Multiplayer").condition(["skyrimse"]),
    ).toBe(false);
    expect(
      register(
        [sp, skyrim],
        "skyrim",
      )("Switch to Multiplayer").condition([GAME_ID]),
    ).toBe(false);
  });

  it("switches to a profile of the type it names", () => {
    const action = register([sp, mp], "sp");

    action("Switch to Multiplayer").action([GAME_ID]);
    action("Switch to Singleplayer").action([GAME_ID]);

    expect(
      vi.mocked(switchGameModeAsync).mock.calls.map(([, gameMode]) => gameMode),
    ).toEqual(["multiplayer", "singleplayer"]);
  });
});

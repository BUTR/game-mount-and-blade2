import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { watchGameModeMenu } from "./gameModeMenu";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { IStateWithBannerlord } from "../types";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  type State = {
    settings: { profiles: { activeProfileId?: string } };
    persistent: { profiles: Record<string, { gameId: string }> };
  };
  const activeProfile = (state: State) => {
    const id = state.settings.profiles.activeProfileId;
    return id !== undefined ? state.persistent.profiles[id] : undefined;
  };
  Object.assign(api.selectors, {
    activeProfile,
    activeGameId: (state: State) => activeProfile(state)?.gameId,
  });
  Object.assign(api.actions, {
    setProfilesVisible: (visible: unknown) => ({
      type: "SET_PROFILES_VISIBLE",
      visible,
    }),
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));

interface Options {
  activeProfileId?: string;
  profiles?: Record<string, { gameId?: string; multiplayer?: boolean }>;
  profilesVisible?: boolean;
}

const makeState = (options: Options): IStateWithBannerlord =>
  ({
    persistent: {
      profiles: Object.fromEntries(
        Object.entries(options.profiles ?? { p1: {} }).map(([id, profile]) => [
          id,
          {
            id,
            gameId: profile.gameId ?? GAME_ID,
            features: {
              [MULTIPLAYER_PROFILE_FEATURE]: profile.multiplayer ?? false,
            },
          },
        ]),
      ),
      mods: {},
    },
    settings: {
      profiles: { activeProfileId: options.activeProfileId ?? "p1" },
      interface: { profilesVisible: options.profilesVisible ?? true },
    },
    session: {},
  }) as unknown as IStateWithBannerlord;

const makeApi = (initial: IStateWithBannerlord) => {
  let state = initial;
  const visible: unknown[] = [];
  const handlers: { path: string[]; handler: () => void }[] = [];
  const api = {
    getState: () => state,
    store: {
      dispatch: (action: { type: string; visible: unknown }) => {
        visible.push(action.visible);
      },
    },
    onStateChange: (path: string[], handler: () => void) => {
      handlers.push({ path, handler });
    },
  };
  return {
    api: api as unknown as types.IExtensionApi,
    visible,
    setState: (next: IStateWithBannerlord) => {
      state = next;
    },
    emit: (path: string) => {
      for (const entry of handlers) {
        if (entry.path.join(".") === path) {
          entry.handler();
        }
      }
    },
  };
};

// The menu re-filters on the frame after the changed value rendered, the test runs the frames itself
let frames: FrameRequestCallback[];
const runFrames = (): void => {
  while (frames.length > 0) {
    const pending = frames;
    frames = [];
    pending.forEach((frame) => frame(0));
  }
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchGameModeMenu", () => {
  it("re-filters the menu when the profile's type changes, keeping Profiles visible", () => {
    const { api, visible, setState, emit } = makeApi(makeState({}));
    watchGameModeMenu(api);

    setState(makeState({ profiles: { p1: { multiplayer: true } } }));
    emit("persistent.profiles");

    // Changed to an equal value first, the menu has to see a change
    expect(visible).toEqual([1]);
    runFrames();
    expect(visible).toEqual([1, true]);
  });

  it("keeps Profiles hidden when the user hid it", () => {
    const { api, visible, setState, emit } = makeApi(
      makeState({ profilesVisible: false }),
    );
    watchGameModeMenu(api);

    setState(
      makeState({
        profilesVisible: false,
        profiles: { p1: { multiplayer: true } },
      }),
    );
    emit("persistent.profiles");
    runFrames();

    expect(visible).toEqual([0, false]);
  });

  it("re-filters when switching to a profile of the other type", () => {
    const profiles = { p1: {}, p2: { multiplayer: true } };
    const { api, visible, setState, emit } = makeApi(makeState({ profiles }));
    watchGameModeMenu(api);

    setState(makeState({ profiles, activeProfileId: "p2" }));
    emit("settings.profiles.activeProfileId");
    runFrames();

    expect(visible).toEqual([1, true]);
  });

  it("leaves the menu alone while the type is the same", () => {
    const profiles = { p1: {}, p2: {} };
    const { api, visible, setState, emit } = makeApi(makeState({ profiles }));
    watchGameModeMenu(api);

    emit("persistent.profiles");
    setState(makeState({ profiles, activeProfileId: "p2" }));
    emit("settings.profiles.activeProfileId");
    runFrames();

    expect(visible).toEqual([]);
  });

  it("leaves the menu alone while another game is managed", () => {
    const profiles = {
      p1: {},
      skyrim: { gameId: "skyrimse", multiplayer: true },
    };
    const { api, visible, setState, emit } = makeApi(makeState({ profiles }));
    watchGameModeMenu(api);

    setState(makeState({ profiles, activeProfileId: "skyrim" }));
    emit("settings.profiles.activeProfileId");
    runFrames();

    expect(visible).toEqual([]);
  });
});

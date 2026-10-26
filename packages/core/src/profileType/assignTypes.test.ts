import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { watchProfileTypes } from "./assignTypes";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    activeGameId: (state: { activeGameId: string }) => state.activeGameId,
  });
  Object.assign(api.actions, {
    setFeature: (profileId: string, feature: string, value: unknown) => ({
      profileId,
      feature,
      value,
    }),
  });
  Object.assign(api.util, {
    batchDispatch: (dispatch: (action: unknown) => void, actions: unknown[]) =>
      dispatch(actions),
  });
  return api;
});

const profile = (
  id: string,
  features?: Record<string, unknown>,
  gameId = GAME_ID,
) => ({ id, gameId, ...(features !== undefined && { features }) });

const setup = (
  profiles: Record<string, unknown>,
  activeGameId: string = GAME_ID,
) => {
  const state = { activeGameId, persistent: { profiles } };
  const batches: unknown[] = [];
  const handlers = new Map<string, () => void>();
  const api = {
    getState: () => state,
    store: { dispatch: (batch: unknown) => batches.push(batch) },
    onStateChange: (path: string[], handler: () => void) =>
      handlers.set(path.join("."), handler),
  } as unknown as types.IExtensionApi;
  watchProfileTypes(api);
  return { batches, state, handlers };
};

describe("watchProfileTypes", () => {
  it("makes untyped profiles Singleplayer, and those made for servers Multiplayer", () => {
    const { batches } = setup({
      plain: profile("plain"),
      server: profile("server", { [SERVER_PROFILE_FEATURE]: "1.2.3.4:7210" }),
      noMods: profile("noMods", { [NO_MODS_PROFILE_FEATURE]: true }),
      noModsFalse: profile("noModsFalse", { [NO_MODS_PROFILE_FEATURE]: false }),
    });

    expect(batches).toEqual([
      [
        {
          profileId: "plain",
          feature: MULTIPLAYER_PROFILE_FEATURE,
          value: false,
        },
        {
          profileId: "server",
          feature: MULTIPLAYER_PROFILE_FEATURE,
          value: true,
        },
        {
          profileId: "noMods",
          feature: MULTIPLAYER_PROFILE_FEATURE,
          value: true,
        },
        {
          profileId: "noModsFalse",
          feature: MULTIPLAYER_PROFILE_FEATURE,
          value: false,
        },
      ],
    ]);
  });

  it("leaves typed profiles and other games' profiles alone", () => {
    const { batches } = setup({
      sp: profile("sp", { [MULTIPLAYER_PROFILE_FEATURE]: false }),
      mp: profile("mp", {
        [MULTIPLAYER_PROFILE_FEATURE]: true,
        [SERVER_PROFILE_FEATURE]: "1.2.3.4:7210",
      }),
      skyrim: profile("skyrim", undefined, "skyrimse"),
    });

    expect(batches).toEqual([]);
  });

  it("waits until Bannerlord is the active game", () => {
    const { batches, state, handlers } = setup(
      { plain: profile("plain") },
      "skyrimse",
    );
    expect(batches).toEqual([]);

    state.activeGameId = GAME_ID;
    handlers.get("settings.profiles.activeProfileId")?.();

    expect(batches).toHaveLength(1);
  });
});

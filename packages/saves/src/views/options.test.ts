import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "@bannerlord/core/common";
import { SavePageOptions } from "./options";

interface IState {
  gameId: string | undefined;
  profile: { id: string } | undefined;
  persistent: {
    profiles: Record<string, { features?: Record<string, boolean> }>;
  };
}

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  return {
    ...original,
    selectors: new Proxy(original.selectors, {
      get: (target, property, receiver) => {
        switch (property) {
          case "activeGameId":
            return (state: IState) => state.gameId;
          case "activeProfile":
            return (state: IState) => state.profile;
          default:
            return Reflect.get(target, property, receiver);
        }
      },
    }),
  };
});

const state = (
  gameId: string | undefined,
  features?: Record<string, boolean>,
): IState => ({
  gameId,
  profile: { id: "profile-1" },
  persistent: {
    profiles: { "profile-1": features !== undefined ? { features } : {} },
  },
});

const options = (state: IState | undefined) => {
  const getState = vi.fn(() => state);
  const context = {
    api: { store: state !== undefined ? {} : undefined, getState },
  } as unknown as types.IExtensionContext;
  return { page: new SavePageOptions(context), getState };
};

describe("SavePageOptions.visible", () => {
  it("shows the page for a Bannerlord singleplayer profile", () => {
    expect(options(state(GAME_ID)).page.visible()).toBe(true);
    expect(
      options(
        state(GAME_ID, { [MULTIPLAYER_PROFILE_FEATURE]: false }),
      ).page.visible(),
    ).toBe(true);
  });

  it("hides the page for a multiplayer profile, it has no saves", () => {
    expect(
      options(
        state(GAME_ID, { [MULTIPLAYER_PROFILE_FEATURE]: true }),
      ).page.visible(),
    ).toBe(false);
  });

  it("hides the page for another game, or none", () => {
    expect(options(state("skyrimse")).page.visible()).toBe(false);
    expect(options(state(undefined)).page.visible()).toBe(false);
  });

  it("hides the page before the store exists, without reading the state", () => {
    const { page, getState } = options(undefined);

    expect(page.visible()).toBe(false);
    expect(getState).not.toHaveBeenCalled();
  });
});

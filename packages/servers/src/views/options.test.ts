import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { ServersPageOptions } from "./options";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // The stub would answer undefined for any game, which would hide the page for the wrong reason
  selectors: { activeGameId: vi.fn() },
}));

const contextWith = (store: unknown): types.IExtensionContext =>
  ({
    api: { store, getState: () => ({}) },
  }) as unknown as types.IExtensionContext;

beforeEach(() => {
  vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
});

describe("ServersPageOptions", () => {
  it("is a per-game page with the servers icon", () => {
    const options = new ServersPageOptions(contextWith({}));

    expect(options.id).toBe("bannerlord-servers");
    expect(options.group).toBe("per-game");
    expect(options.mdi).toMatch(/^M3 1\.5H21V3H3Z/);
    expect(options.props()).toEqual({});
  });

  it("shows the page while Bannerlord is the active game, whatever the profile type", () => {
    expect(new ServersPageOptions(contextWith({})).visible()).toBe(true);
  });

  it("hides the page for another game and before the store exists", () => {
    vi.mocked(selectors.activeGameId).mockReturnValue("skyrimse");
    expect(new ServersPageOptions(contextWith({})).visible()).toBe(false);

    vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
    expect(new ServersPageOptions(contextWith(undefined)).visible()).toBe(
      false,
    );
  });
});

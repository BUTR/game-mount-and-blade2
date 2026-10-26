import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { watchRemovedProfiles } from "./removedProfiles";
import { removeProfileLoadOrdersAsync } from "../loadOrder/persistence";
import { actionsSettings } from "../settings/actions";
import { GAME_ID } from "../common";

vi.mock("../loadOrder/persistence", () => ({
  removeProfileLoadOrdersAsync: vi.fn(() => Promise.resolve()),
}));

describe("watchRemovedProfiles", () => {
  it("removes the settings and load orders of removed Bannerlord profiles only", () => {
    const dispatched: { type: string; payload: unknown }[] = [];
    let handler: ((previous: unknown, current: unknown) => void) | undefined;
    const api = {
      store: {
        dispatch: (action: (typeof dispatched)[number]) =>
          dispatched.push(action),
      },
      onStateChange: (
        _path: string[],
        callback: (previous: unknown, current: unknown) => void,
      ) => {
        handler = callback;
      },
    } as unknown as types.IExtensionApi;
    watchRemovedProfiles(api);

    handler?.(
      {
        kept: { id: "kept", gameId: GAME_ID },
        removed: { id: "removed", gameId: GAME_ID },
        skyrim: { id: "skyrim", gameId: "skyrimse" },
      },
      { kept: { id: "kept", gameId: GAME_ID } },
    );

    expect(dispatched).toEqual([
      actionsSettings.removeProfileSettings("removed"),
    ]);
    expect(removeProfileLoadOrdersAsync).toHaveBeenCalledTimes(1);
    expect(removeProfileLoadOrdersAsync).toHaveBeenCalledWith(api, "removed");
  });
});

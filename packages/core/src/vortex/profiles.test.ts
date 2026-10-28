import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types, util } from "@nexusmods/vortex-api";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createProfileAsync, switchProfileAsync } from "./profiles";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";

const vortex = vi.hoisted(() => ({ userData: "" }));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  class UserCanceled extends Error {}
  Object.assign(api.util, {
    UserCanceled,
    getVortexPath: (id: string) =>
      id === "userData" ? vortex.userData : `<${id}>`,
  });
  Object.assign(api.actions, {
    setNextProfile: (profileId: string) => ({
      type: "SET_NEXT_PROFILE",
      profileId,
    }),
    setProfile: (profile: types.IProfile) => ({
      type: "SET_PROFILE",
      profile,
    }),
  });
  return api;
});

describe("createProfileAsync", () => {
  beforeEach(async () => {
    vortex.userData = await mkdtemp(
      path.join(os.tmpdir(), "bannerlord-profiles-"),
    );
  });

  afterEach(async () => {
    await rm(vortex.userData, { recursive: true, force: true });
  });

  const makeApi = () => {
    const dispatched: unknown[] = [];
    const api = {
      store: { dispatch: (action: unknown) => dispatched.push(action) },
    } as unknown as types.IExtensionApi;
    return { api, dispatched };
  };

  it("creates an empty profile for the game with its folder, the way Vortex's profile page does", async () => {
    const { api, dispatched } = makeApi();
    const features = { [MULTIPLAYER_PROFILE_FEATURE]: true };

    const profile = await createProfileAsync(api, "Server", features);

    expect(profile).toEqual({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{12}$/),
      gameId: GAME_ID,
      name: "Server",
      modState: {},
      lastActivated: 0,
      features,
    });
    expect(dispatched).toEqual([{ type: "SET_PROFILE", profile }]);
    const folder = path.join(vortex.userData, GAME_ID, "profiles", profile.id);
    expect((await stat(folder)).isDirectory()).toBe(true);
  });

  it("gives each profile its own id and keeps the mod states it is given", async () => {
    const { api } = makeApi();
    const modState = { harmony: { enabled: true, enabledTime: 1 } };

    const first = await createProfileAsync(api, "A", {});
    const second = await createProfileAsync(api, "B", {}, modState);

    expect(second.id).not.toBe(first.id);
    expect(second.modState).toBe(modState);
  });
});

interface Profiles {
  activeProfileId?: string;
  nextProfileId?: string;
}

/**
 * A store whose reaction to setNextProfile the test decides, as Vortex's profile switching does
 */
const makeStore = (
  initial: Profiles,
  onSetNext: (profiles: Profiles, profileId: string) => Profiles,
) => {
  let profiles = initial;
  const listeners = new Set<() => void>();
  const store = {
    getState: () => ({ settings: { profiles } }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (action: { profileId: string }) => {
      const next = onSetNext(profiles, action.profileId);
      if (next !== profiles) {
        profiles = next;
        listeners.forEach((listener) => listener());
      }
    },
    update: (next: Profiles) => {
      profiles = next;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
  return store;
};

const apiWith = (store: unknown) =>
  ({ store }) as unknown as types.IExtensionApi;

describe("switchProfileAsync", () => {
  it("resolves at once for the active profile", async () => {
    const store = makeStore({ activeProfileId: "p1" }, () => {
      throw new Error("should not switch");
    });

    await expect(switchProfileAsync(apiWith(store), "p1")).resolves.toBe(
      undefined,
    );
  });

  it("resolves once Vortex has switched to the profile", async () => {
    const store = makeStore({ activeProfileId: "p1" }, (profiles, id) => ({
      ...profiles,
      nextProfileId: id,
    }));

    const switching = switchProfileAsync(apiWith(store), "p2");
    let settled = false;
    void switching.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    store.update({ activeProfileId: "p2", nextProfileId: "p2" });

    await expect(switching).resolves.toBe(undefined);
    expect(store.listenerCount()).toBe(0);
  });

  it("rejects as canceled when Vortex clears the next profile", async () => {
    const store = makeStore({ activeProfileId: "p1" }, (profiles, id) => ({
      ...profiles,
      nextProfileId: id,
    }));

    const switching = switchProfileAsync(apiWith(store), "p2");
    store.update({ activeProfileId: "p1" });

    await expect(switching).rejects.toBeInstanceOf(util.UserCanceled);
    expect(store.listenerCount()).toBe(0);
  });

  it("rejects when Vortex doesn't start the switch", async () => {
    const store = makeStore({ activeProfileId: "p1" }, (profiles) => profiles);

    await expect(switchProfileAsync(apiWith(store), "p2")).rejects.toThrow(
      "Vortex did not start switching the profile",
    );
    expect(store.listenerCount()).toBe(0);
  });

  it("rejects without a store", async () => {
    await expect(switchProfileAsync(apiWith(undefined), "p2")).rejects.toThrow(
      "store",
    );
  });
});

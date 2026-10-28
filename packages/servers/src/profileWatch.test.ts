import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  GAME_ID,
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "@bannerlord/core/common";
import { SERVER_NAME_PROFILE_FEATURE } from "./profiles";
import { watchClonedServerProfiles } from "./profileWatch";

vi.mock("@butr/vortexextensionnative", () => ({
  types: {
    ApplicationVersionType: {
      Alpha: "Alpha",
      Beta: "Beta",
      EarlyAccess: "EarlyAccess",
      Release: "Release",
      Development: "Development",
      Invalid: "Invalid",
    },
    LoadType: {},
  },
  BannerlordModuleManager: {},
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actions: new Proxy(
    {},
    {
      get:
        (_, type) =>
        (...args: unknown[]) => ({ type: String(type), args }),
    },
  ),
}));

type Profiles = Record<string, types.IProfile>;

const profile = (
  id: string,
  features: Record<string, unknown>,
  options: { gameId?: string; pendingRemove?: boolean } = {},
): types.IProfile =>
  ({
    id,
    gameId: options.gameId ?? GAME_ID,
    features,
    ...(options.pendingRemove !== undefined && {
      pendingRemove: options.pendingRemove,
    }),
  }) as unknown as types.IProfile;

const watch = () => {
  let listener: (previous: unknown, current: unknown) => void = () => undefined;
  const dispatch = vi.fn();
  watchClonedServerProfiles({
    onStateChange: (_: string[], callback: typeof listener) => {
      listener = callback;
    },
    store: { dispatch },
  } as unknown as types.IExtensionApi);
  return (previous: Profiles | undefined, current: Profiles): unknown[] => {
    dispatch.mockClear();
    listener(previous, current);
    return dispatch.mock.calls.map(([action]) => action);
  };
};

const SERVER_FEATURES = {
  [SERVER_PROFILE_FEATURE]: "a:1",
  [SERVER_NAME_PROFILE_FEATURE]: "EU #1",
  bannerlord_multiplayer: true,
};

describe("watchClonedServerProfiles", () => {
  it("makes a clone of a server profile an ordinary profile", () => {
    const change = watch();
    const original = profile("original", SERVER_FEATURES);

    expect(
      change(
        { original },
        { original, clone: profile("clone", SERVER_FEATURES) },
      ),
    ).toEqual([
      {
        type: "setFeature",
        args: ["clone", SERVER_PROFILE_FEATURE, undefined],
      },
      {
        type: "setFeature",
        args: ["clone", SERVER_NAME_PROFILE_FEATURE, undefined],
      },
    ]);
  });

  it("makes a clone of the No Mods profile an ordinary profile", () => {
    const change = watch();
    const original = profile("original", { [NO_MODS_PROFILE_FEATURE]: true });

    expect(
      change(
        { original },
        {
          original,
          clone: profile("clone", { [NO_MODS_PROFILE_FEATURE]: true }),
        },
      ),
    ).toEqual([
      {
        type: "setFeature",
        args: ["clone", NO_MODS_PROFILE_FEATURE, undefined],
      },
    ]);
  });

  it("keeps the features of profiles loaded at startup", () => {
    const change = watch();

    expect(
      change(undefined, {
        a: profile("a", SERVER_FEATURES),
        b: profile("b", { [NO_MODS_PROFILE_FEATURE]: true }),
      }),
    ).toEqual([]);
  });

  it("keeps a new profile for a different server", () => {
    const change = watch();
    const original = profile("original", SERVER_FEATURES);

    expect(
      change(
        { original },
        {
          original,
          other: profile("other", {
            ...SERVER_FEATURES,
            [SERVER_PROFILE_FEATURE]: "b:1",
          }),
        },
      ),
    ).toEqual([]);
  });

  it("keeps a profile recreated while the original is being removed", () => {
    const change = watch();
    const original = profile("original", SERVER_FEATURES, {
      pendingRemove: true,
    });

    expect(
      change(
        { original },
        { original, again: profile("again", SERVER_FEATURES) },
      ),
    ).toEqual([]);
  });

  it("only compares with this game's profiles, and ignores other games' new profiles", () => {
    const change = watch();
    const otherGame = profile("other-game", SERVER_FEATURES, {
      gameId: "skyrimse",
    });

    expect(
      change(
        { "other-game": otherGame },
        { "other-game": otherGame, fresh: profile("fresh", SERVER_FEATURES) },
      ),
    ).toEqual([]);
    expect(
      change(
        { original: profile("original", SERVER_FEATURES) },
        {
          original: profile("original", SERVER_FEATURES),
          clone: profile("clone", SERVER_FEATURES, { gameId: "skyrimse" }),
        },
      ),
    ).toEqual([]);
  });

  it("leaves existing profiles alone", () => {
    const change = watch();
    const a = profile("a", SERVER_FEATURES);
    const b = profile("b", SERVER_FEATURES);

    expect(change({ a, b }, { a, b })).toEqual([]);
  });
});

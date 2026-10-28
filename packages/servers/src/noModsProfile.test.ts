import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectors, types } from "@nexusmods/vortex-api";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
} from "@bannerlord/core/common";
import { SERVER_JOIN_MOD_ID } from "./join";
import { isNoModsProfile, watchNoModsProfile } from "./noModsProfile";

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

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const withFallback = <T extends object>(members: T): T =>
    new Proxy(members, {
      get: (target, name) =>
        name in target ? target[name as keyof T] : () => undefined,
    });
  return {
    ...(await importOriginal<object>()),
    actions: new Proxy(
      {},
      {
        get:
          (_, type) =>
          (...args: unknown[]) => ({ type: String(type), args }),
      },
    ),
    selectors: withFallback({ activeGameId: vi.fn() }),
    util: withFallback({
      batchDispatch: (dispatch: (action: unknown) => void, all: unknown[]) =>
        all.forEach((action) => dispatch(action)),
      renderModName: (mod: { id: string }) => `<${mod.id}>`,
    }),
  };
});

vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      localize: (text: string, params?: Record<string, string>) =>
        Object.entries(params ?? {}).reduce(
          (result, [key, value]) => result.replace(`{{${key}}}`, value),
          text,
        ),
    }),
  },
}));

type Profiles = Record<string, types.IProfile>;
type Listener = (previous: unknown, current: unknown) => void;

const MODS = {
  harmony: { id: "harmony", attributes: { modId: 2006 } },
  butterlib: { id: "butterlib", attributes: { modId: 2018 } },
  "server-join": {
    id: "server-join",
    attributes: { modId: SERVER_JOIN_MOD_ID },
  },
};

const noModsProfile = (
  enabled: string[],
  features: Record<string, unknown> = { [MULTIPLAYER_PROFILE_FEATURE]: true },
): types.IProfile =>
  ({
    id: "no-mods",
    gameId: GAME_ID,
    name: "No Mods",
    modState: Object.fromEntries(
      enabled.map((modId) => [modId, { enabled: true }]),
    ),
    features: { [NO_MODS_PROFILE_FEATURE]: true, ...features },
  }) as unknown as types.IProfile;

const watch = () => {
  let listener: Listener = () => undefined;
  const dispatch = vi.fn();
  const sendNotification = vi.fn();
  const api = {
    onStateChange: (path: string[], callback: Listener) => {
      expect(path).toEqual(["persistent", "profiles"]);
      listener = callback;
    },
    getState: () => ({ persistent: { mods: { [GAME_ID]: MODS } } }),
    store: { dispatch },
    sendNotification,
  } as unknown as types.IExtensionApi;
  watchNoModsProfile(api);
  return {
    change: (previous: Profiles | undefined, current: Profiles) =>
      listener(previous, current),
    dispatched: () => dispatch.mock.calls.map(([action]) => action),
    sendNotification,
  };
};

beforeEach(() => {
  vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
});

describe("isNoModsProfile", () => {
  it("is the profile with the No Mods feature", () => {
    expect(isNoModsProfile(noModsProfile([]))).toBe(true);
    expect(isNoModsProfile({ features: {} } as unknown as types.IProfile)).toBe(
      false,
    );
    expect(isNoModsProfile(undefined)).toBe(false);
  });
});

describe("watchNoModsProfile", () => {
  it("disables mods newly enabled in the No Mods profile and says so", () => {
    const { change, dispatched, sendNotification } = watch();

    change(
      { "no-mods": noModsProfile(["server-join"]) },
      { "no-mods": noModsProfile(["server-join", "harmony", "butterlib"]) },
    );

    expect(dispatched()).toEqual([
      { type: "setModEnabled", args: ["no-mods", "harmony", false] },
      { type: "setModEnabled", args: ["no-mods", "butterlib", false] },
    ]);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "bannerlord-no-mods-profile-no-mods",
        type: "warning",
        message: expect.stringContaining("<harmony>, <butterlib> was disabled"),
      }),
    );
  });

  it("keeps Server Join enabled", () => {
    const { change, dispatched, sendNotification } = watch();

    change(
      { "no-mods": noModsProfile([]) },
      { "no-mods": noModsProfile(["server-join"]) },
    );

    expect(dispatched()).toEqual([]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("disables the mods a No Mods profile is created with", () => {
    const { change, dispatched } = watch();

    change(undefined, { "no-mods": noModsProfile(["server-join", "harmony"]) });

    expect(dispatched()).toEqual([
      { type: "setModEnabled", args: ["no-mods", "harmony", false] },
    ]);
  });

  it("only acts on mods that were just enabled", () => {
    const { change, dispatched } = watch();

    change(
      { "no-mods": noModsProfile(["harmony"]) },
      { "no-mods": noModsProfile(["harmony"]) },
    );

    expect(dispatched()).toEqual([]);
  });

  it("leaves mods that are no longer installed to Vortex", () => {
    const { change, dispatched } = watch();

    change(
      { "no-mods": noModsProfile([]) },
      { "no-mods": noModsProfile(["uninstalled"]) },
    );

    expect(dispatched()).toEqual([]);
  });

  it("leaves other profiles alone", () => {
    const { change, dispatched } = watch();
    const regular = {
      ...noModsProfile(["harmony"]),
      id: "regular",
      features: { [MULTIPLAYER_PROFILE_FEATURE]: true },
    } as types.IProfile;

    change({ regular: { ...regular, modState: {} } }, { regular });

    expect(dispatched()).toEqual([]);
  });

  it("does nothing while another game is active", () => {
    vi.mocked(selectors.activeGameId).mockReturnValue("skyrimse");
    const { change, dispatched } = watch();

    change(
      { "no-mods": noModsProfile([]) },
      { "no-mods": noModsProfile(["harmony"], {}) },
    );

    expect(dispatched()).toEqual([]);
  });

  it("changes the profile back to Multiplayer, warning when the user changed it", () => {
    const { change, dispatched, sendNotification } = watch();

    change(
      { "no-mods": noModsProfile([]) },
      {
        "no-mods": noModsProfile([], { [MULTIPLAYER_PROFILE_FEATURE]: false }),
      },
    );

    expect(dispatched()).toEqual([
      {
        type: "setFeature",
        args: ["no-mods", MULTIPLAYER_PROFILE_FEATURE, true],
      },
    ]);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "bannerlord-no-mods-profile-type-no-mods",
      }),
    );
  });

  it("sets the type of a newly made No Mods profile without a warning", () => {
    const { change, dispatched, sendNotification } = watch();

    change({}, { "no-mods": noModsProfile([], {}) });

    expect(dispatched()).toEqual([
      {
        type: "setFeature",
        args: ["no-mods", MULTIPLAYER_PROFILE_FEATURE, true],
      },
    ]);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

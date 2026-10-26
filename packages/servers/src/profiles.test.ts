import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { ILobbyServer } from "@bannerlord/lobby";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "@bannerlord/core/common";
import { IBannerlordMod, IModuleCache } from "@bannerlord/core/types";
import { createProfileAsync } from "@bannerlord/core/vortex/profiles";
import { enableModsAsync } from "@bannerlord/core/vortex/deploy";
import { enableInProfileLoadOrderAsync } from "@bannerlord/core/loadOrder/persistence";
import { StagedModules } from "@bannerlord/core/vortex/stagedModules";
import { JOIN_MODULE_ID } from "./join";
import { IClientModuleRequirement } from "./modules";
import { IServerRow } from "./row";
import {
  createNoModsProfileAsync,
  createServerProfileAsync,
  enableServerModsAsync,
  findNoModsProfile,
  findServerProfile,
  getServerName,
  getServerProfileBlockers,
  getServerProfileName,
  IServerProfilePlan,
  limitPlanToServerJoin,
  planServerProfile,
  SERVER_NAME_PROFILE_FEATURE,
  syncServerProfileNames,
} from "./profiles";

vi.mock("@butr/vortexextensionnative", () => {
  const order = (version: {
    major: number;
    minor: number;
    revision: number;
    changeSet: number;
  }): number[] => [
    version.major,
    version.minor,
    version.revision,
    version.changeSet,
  ];
  return {
    types: {
      ApplicationVersionType: {
        Alpha: "Alpha",
        Beta: "Beta",
        EarlyAccess: "EarlyAccess",
        Release: "Release",
        Development: "Development",
        Invalid: "Invalid",
      },
      LoadType: {
        None: "None",
        LoadAfterThis: "LoadAfterThis",
        LoadBeforeThis: "LoadBeforeThis",
      },
    },
    BannerlordModuleManager: {
      getDependenciesAll: (module: { dependentModuleMetadatas?: unknown[] }) =>
        module.dependentModuleMetadatas ?? [],
      compareVersions: (
        lhs: Parameters<typeof order>[0],
        rhs: Parameters<typeof order>[0],
      ): number => {
        const a = order(lhs);
        const b = order(rhs);
        const index = a.findIndex((part, i) => part !== b[i]);
        return index === -1 ? 0 : Math.sign((a[index] ?? 0) - (b[index] ?? 0));
      },
    },
  };
});

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
    util: withFallback({
      batchDispatch: (dispatch: (action: unknown) => void, all: unknown[]) =>
        all.forEach((action) => dispatch(action)),
    }),
  };
});

vi.mock("@bannerlord/core/vortex/profiles", () => ({
  createProfileAsync: vi.fn(async () => ({ id: "new-profile" })),
}));
vi.mock("@bannerlord/core/vortex/deploy", () => ({
  enableModsAsync: vi.fn(async () => undefined),
}));
vi.mock("@bannerlord/core/loadOrder/persistence", () => ({
  enableInProfileLoadOrderAsync: vi.fn(async () => undefined),
}));

const version = (text: string): vetypes.ApplicationVersion => {
  const [major = 0, minor = 0, revision = 0, changeSet = 0] = text
    .slice(1)
    .split(".")
    .map(Number);
  return {
    applicationVersionType: "Release" as vetypes.ApplicationVersionType,
    major,
    minor,
    revision,
    changeSet,
  };
};

const requirement = (
  id: string,
  wanted: string | null,
  required = true,
): IClientModuleRequirement => ({
  id,
  name: `${id} name`,
  version: wanted,
  required,
  fromLobby: true,
  nexusMods: null,
  url: null,
});

/**
 * Modules in Vortex: module id -> [mod id, version, required dependencies][]
 */
const stagedOf = (
  modules: Record<string, [string, string, string[]?][]>,
): StagedModules =>
  new Map(
    Object.entries(modules).map(([id, candidates]) => [
      id,
      candidates.map(([modId, text, dependencies = []]) => ({
        modId,
        module: {
          id,
          name: id,
          version: version(text),
          requiredDependencyIds: dependencies,
        },
      })),
    ]),
  );

const unmanagedOf = (modules: Record<string, string>): IModuleCache =>
  Object.fromEntries(
    Object.entries(modules).map(([id, text]) => [
      id,
      { id, name: id, version: version(text), dependentModuleMetadatas: [] },
    ]),
  ) as unknown as IModuleCache;

const WITH_JOIN = { [JOIN_MODULE_ID]: [["sj-mod", "v1.0.0.0"]] } as Record<
  string,
  [string, string, string[]?][]
>;

const lobby = (ServerName: string): ILobbyServer =>
  ({ ServerName, LoadedModules: [] }) as unknown as ILobbyServer;

const row = (overrides: Partial<IServerRow> = {}): IServerRow => ({
  id: "203.0.113.7:7210",
  address: "203.0.113.7",
  port: 7210,
  manual: null,
  lobby: null,
  probe: null,
  extension: null,
  pinned: false,
  favorite: false,
  ...overrides,
});

const profile = (
  id: string,
  features: Record<string, unknown>,
  options: {
    gameId?: string;
    lastActivated?: number;
    pendingRemove?: boolean;
  } = {},
): types.IProfile =>
  ({
    id,
    gameId: options.gameId ?? GAME_ID,
    name: id,
    modState: {},
    lastActivated: options.lastActivated ?? 0,
    features,
    ...(options.pendingRemove !== undefined && {
      pendingRemove: options.pendingRemove,
    }),
  }) as unknown as types.IProfile;

describe("findServerProfile", () => {
  it("finds the most recently used profile made for the server", () => {
    const profiles = {
      old: profile(
        "old",
        { [SERVER_PROFILE_FEATURE]: "a:1" },
        { lastActivated: 1 },
      ),
      recent: profile(
        "recent",
        { [SERVER_PROFILE_FEATURE]: "a:1" },
        { lastActivated: 5 },
      ),
      other: profile(
        "other",
        { [SERVER_PROFILE_FEATURE]: "b:1" },
        { lastActivated: 9 },
      ),
    };

    expect(findServerProfile(profiles, "a:1")?.id).toBe("recent");
  });

  it("falls back to profiles never activated", () => {
    const profiles = {
      never: {
        ...profile("never", { [SERVER_PROFILE_FEATURE]: "a:1" }),
        lastActivated: undefined,
      } as unknown as types.IProfile,
    };

    expect(findServerProfile(profiles, "a:1")?.id).toBe("never");
  });

  it("skips profiles being removed and other games' profiles", () => {
    const profiles = {
      removed: profile(
        "removed",
        { [SERVER_PROFILE_FEATURE]: "a:1" },
        { pendingRemove: true },
      ),
      skyrim: profile(
        "skyrim",
        { [SERVER_PROFILE_FEATURE]: "a:1" },
        { gameId: "skyrimse" },
      ),
    };

    expect(findServerProfile(profiles, "a:1")).toBeUndefined();
  });
});

describe("findNoModsProfile", () => {
  it("finds the most recently used No Mods profile", () => {
    const profiles = {
      a: profile(
        "a",
        { [NO_MODS_PROFILE_FEATURE]: true },
        { lastActivated: 2 },
      ),
      b: profile(
        "b",
        { [NO_MODS_PROFILE_FEATURE]: true },
        { lastActivated: 3 },
      ),
      c: profile(
        "c",
        { [NO_MODS_PROFILE_FEATURE]: false },
        { lastActivated: 9 },
      ),
    };

    expect(findNoModsProfile(profiles)?.id).toBe("b");
    expect(findNoModsProfile({})).toBeUndefined();
  });
});

describe("getServerName", () => {
  it("cleans the lobby's name and is undefined without one", () => {
    expect(getServerName(row({ lobby: lobby("\u0007 EU\tServer ") }))).toBe(
      "EU Server",
    );
    expect(getServerName(row({ lobby: lobby(" \u0000 ") }))).toBeUndefined();
    expect(getServerName(row())).toBeUndefined();
  });
});

describe("getServerProfileName", () => {
  it("uses the server name, or the address when the lobby doesn't list it", () => {
    expect(getServerProfileName(row({ lobby: lobby("My Server") }))).toBe(
      "My Server",
    );
    expect(
      getServerProfileName(row({ address: "2001:db8::1", port: 7300 })),
    ).toBe("[2001:db8::1]:7300");
  });

  it("shortens long names to 64 characters", () => {
    const name = getServerProfileName(row({ lobby: lobby("x".repeat(100)) }));

    expect(name).toHaveLength(64);
    expect(name.endsWith("…")).toBe(true);
    expect(getServerProfileName(row({ lobby: lobby("y".repeat(64)) }))).toBe(
      "y".repeat(64),
    );
  });

  it("doesn't cut an emoji in half when shortening", () => {
    const name = getServerProfileName(
      row({ lobby: lobby(`${"x".repeat(62)}😀yyy`) }),
    );

    expect(name).toBe(`${"x".repeat(62)}…`);
  });
});

describe("planServerProfile", () => {
  it("picks the mod with the exact version the server asks for", () => {
    const plan = planServerProfile(
      [requirement("A", "v1.2.0.0")],
      stagedOf({
        ...WITH_JOIN,
        A: [
          ["a-new", "v1.3.0.0"],
          ["a-wanted", "v1.2.0.0"],
        ],
      }),
      {},
    );

    expect(plan).toEqual({
      modIds: ["a-wanted", "sj-mod"],
      modules: [
        { id: "A", name: "A" },
        { id: JOIN_MODULE_ID, name: JOIN_MODULE_ID },
      ],
      missing: [],
      wrongVersion: [],
    });
  });

  it("adds dependencies in their newest version", () => {
    const plan = planServerProfile(
      [requirement("A", "v1.0.0.0")],
      stagedOf({
        ...WITH_JOIN,
        A: [["a", "v1.0.0.0", ["Harmony"]]],
        Harmony: [
          ["harmony-old", "v2.2.0.0"],
          ["harmony-new", "v2.3.0.0"],
          ["harmony-mid", "v2.2.5.0"],
        ],
      }),
      {},
    );

    expect(plan.modIds).toEqual(["a", "sj-mod", "harmony-new"]);
    expect(plan.modules.map((x) => x.id)).toEqual([
      "A",
      JOIN_MODULE_ID,
      "Harmony",
    ]);
  });

  it("uses modules installed outside Vortex without a mod", () => {
    const plan = planServerProfile(
      [requirement("Native", "v1.2.12.0")],
      stagedOf(WITH_JOIN),
      unmanagedOf({ Native: "v1.2.12.0" }),
    );

    expect(plan.modIds).toEqual(["sj-mod"]);
    expect(plan.modules.map((x) => x.id)).toContain("Native");
  });

  it("reports a module installed outside Vortex in the wrong version, even when Vortex has the right one", () => {
    const plan = planServerProfile(
      [requirement("A", "v2.0.0.0")],
      stagedOf({ ...WITH_JOIN, A: [["a", "v2.0.0.0"]] }),
      unmanagedOf({ A: "v1.0.0.0" }),
    );

    expect(plan.wrongVersion).toEqual([
      { id: "A", name: "A name", wanted: "v2.0.0.0", available: ["v1.0.0.0"] },
    ]);
    expect(plan.modIds).not.toContain("a");
  });

  it("reports what Vortex lacks or has only in other versions", () => {
    const plan = planServerProfile(
      [requirement("Missing", "v1.0.0.0"), requirement("Wrong", "v3.0.0.0")],
      stagedOf({
        Wrong: [
          ["w1", "v1.0.0.0"],
          ["w2", "v2.0.0.0"],
        ],
      }),
      {},
    );

    expect(plan.missing).toEqual([
      { id: "Missing", name: "Missing name" },
      { id: JOIN_MODULE_ID, name: JOIN_MODULE_ID },
    ]);
    expect(plan.wrongVersion).toEqual([
      {
        id: "Wrong",
        name: "Wrong name",
        wanted: "v3.0.0.0",
        available: ["v1.0.0.0", "v2.0.0.0"],
      },
    ]);
    expect(plan.modIds).toEqual([]);
  });

  it("leaves out optional modules", () => {
    const plan = planServerProfile(
      [requirement("Optional", null, false)],
      stagedOf({ ...WITH_JOIN, Optional: [["o", "v1.0.0.0"]] }),
      {},
    );

    expect(plan.modIds).toEqual(["sj-mod"]);
  });

  it("lists a mod once when it provides several modules, and survives dependency cycles", () => {
    const plan = planServerProfile(
      [requirement("A", null), requirement("B", null)],
      stagedOf({
        ...WITH_JOIN,
        A: [["pack", "v1.0.0.0", ["B"]]],
        B: [["pack", "v1.0.0.0", ["A"]]],
      }),
      {},
    );

    expect(plan.modIds).toEqual(["pack", "sj-mod"]);
    expect(plan.modules.map((x) => x.id)).toEqual(["A", "B", JOIN_MODULE_ID]);
  });
});

describe("limitPlanToServerJoin", () => {
  it("keeps only Server Join", () => {
    const plan: IServerProfilePlan = {
      modIds: ["harmony", "sj-mod", "gone"],
      modules: [
        { id: "Bannerlord.Harmony", name: "Harmony" },
        { id: JOIN_MODULE_ID, name: "Server Join" },
      ],
      missing: [
        { id: "X", name: "X" },
        { id: JOIN_MODULE_ID, name: "Server Join" },
      ],
      wrongVersion: [{ id: "Y", name: "Y", wanted: "v1.0.0.0", available: [] }],
    };
    const mods = {
      harmony: { id: "harmony", attributes: { modId: 2006 } },
      "sj-mod": { id: "sj-mod", attributes: { modId: 13892 } },
    } as unknown as Record<string, IBannerlordMod>;

    expect(limitPlanToServerJoin(plan, mods)).toEqual({
      modIds: ["sj-mod"],
      modules: [{ id: JOIN_MODULE_ID, name: "Server Join" }],
      missing: [{ id: JOIN_MODULE_ID, name: "Server Join" }],
      wrongVersion: [],
    });
  });
});

describe("getServerProfileBlockers", () => {
  it("waits for the mods in Vortex", () => {
    expect(getServerProfileBlockers(null)).toEqual([
      "Reading the mods installed in Vortex...",
    ]);
  });

  it("explains each problem", () => {
    expect(
      getServerProfileBlockers({
        modIds: [],
        modules: [],
        missing: [
          { id: JOIN_MODULE_ID, name: JOIN_MODULE_ID },
          { id: "A", name: "Mod A" },
          { id: "B", name: "Mod B" },
        ],
        wrongVersion: [
          {
            id: "C",
            name: "Mod C",
            wanted: "v2.0.0.0",
            available: ["v1.0.0.0", "v1.5.0.0"],
          },
        ],
      }),
    ).toEqual([
      expect.stringMatching(/^Install the BUTR Server Join module/),
      "Install these mods in Vortex first: Mod A, Mod B.",
      "The server needs Mod C v2.0.0.0, Vortex has v1.0.0.0, v1.5.0.0.",
    ]);
  });

  it("has none for a complete plan", () => {
    expect(
      getServerProfileBlockers({
        modIds: ["a"],
        modules: [],
        missing: [],
        wrongVersion: [],
      }),
    ).toEqual([]);
  });
});

describe("createServerProfileAsync", () => {
  beforeEach(() => {
    vi.mocked(createProfileAsync).mockClear();
  });

  const api = {} as types.IExtensionApi;

  it("ties a Multiplayer profile to the server, named and described after it", async () => {
    await createServerProfileAsync(api, row({ lobby: lobby(" EU #1 ") }));

    expect(createProfileAsync).toHaveBeenCalledWith(api, "EU #1", {
      [SERVER_PROFILE_FEATURE]: "203.0.113.7:7210",
      [SERVER_NAME_PROFILE_FEATURE]: "EU #1",
      "profile-description": "EU #1",
      [MULTIPLAYER_PROFILE_FEATURE]: true,
    });
  });

  it("names it after the address for a server the lobby doesn't list", async () => {
    await createServerProfileAsync(api, row());

    expect(createProfileAsync).toHaveBeenCalledWith(api, "203.0.113.7:7210", {
      [SERVER_PROFILE_FEATURE]: "203.0.113.7:7210",
      [MULTIPLAYER_PROFILE_FEATURE]: true,
    });
  });
});

describe("createNoModsProfileAsync", () => {
  it("makes a Multiplayer profile with the No Mods feature, named as asked", async () => {
    vi.mocked(createProfileAsync).mockClear();
    const api = {} as types.IExtensionApi;

    await createNoModsProfileAsync(api, "No Mods");

    expect(createProfileAsync).toHaveBeenCalledWith(api, "No Mods", {
      [NO_MODS_PROFILE_FEATURE]: true,
      [MULTIPLAYER_PROFILE_FEATURE]: true,
    });
  });
});

describe("syncServerProfileNames", () => {
  const sync = (
    profiles: Record<string, types.IProfile>,
    rows: Record<string, IServerRow>,
  ): unknown[] => {
    const dispatch = vi.fn();
    const api = { store: { dispatch } } as unknown as types.IExtensionApi;
    syncServerProfileNames(api, profiles, rows);
    return dispatch.mock.calls.map(([action]) => action);
  };

  const listed = { "a:1": row({ id: "a:1", lobby: lobby("New Name") }) };

  const serverProfile = (features: Record<string, unknown>) =>
    profile("p", { [SERVER_PROFILE_FEATURE]: "a:1", ...features });

  it("stores a renamed server's name, and its description while it was the old name", () => {
    expect(
      sync(
        {
          p: serverProfile({
            [SERVER_NAME_PROFILE_FEATURE]: "Old Name",
            "profile-description": "Old Name",
          }),
        },
        listed,
      ),
    ).toEqual([
      {
        type: "setFeature",
        args: ["p", SERVER_NAME_PROFILE_FEATURE, "New Name"],
      },
      { type: "setFeature", args: ["p", "profile-description", "New Name"] },
    ]);
  });

  it("fills an empty description", () => {
    expect(
      sync(
        {
          p: serverProfile({
            [SERVER_NAME_PROFILE_FEATURE]: "New Name",
            "profile-description": "  ",
          }),
        },
        listed,
      ),
    ).toEqual([
      { type: "setFeature", args: ["p", "profile-description", "New Name"] },
    ]);
  });

  it("keeps a description the user wrote", () => {
    expect(
      sync(
        {
          p: serverProfile({
            [SERVER_NAME_PROFILE_FEATURE]: "Old Name",
            "profile-description": "My clan's server",
          }),
        },
        listed,
      ),
    ).toEqual([
      {
        type: "setFeature",
        args: ["p", SERVER_NAME_PROFILE_FEATURE, "New Name"],
      },
    ]);
  });

  it("changes nothing when the names are current", () => {
    expect(
      sync(
        {
          p: serverProfile({
            [SERVER_NAME_PROFILE_FEATURE]: "New Name",
            "profile-description": "New Name",
          }),
        },
        listed,
      ),
    ).toEqual([]);
  });

  it("leaves servers the lobby doesn't list and other profiles alone", () => {
    expect(
      sync(
        {
          unlisted: profile("unlisted", { [SERVER_PROFILE_FEATURE]: "b:1" }),
          plain: profile("plain", {}),
          other: profile(
            "other",
            { [SERVER_PROFILE_FEATURE]: "a:1" },
            { gameId: "skyrimse" },
          ),
        },
        { ...listed, "b:1": row({ id: "b:1" }) },
      ),
    ).toEqual([]);
  });
});

describe("enableServerModsAsync", () => {
  it("enables the mods and their modules in the multiplayer load order", async () => {
    const api = {} as types.IExtensionApi;
    const modules = [{ id: "A", name: "A" }];

    await enableServerModsAsync(api, "p", { modIds: ["a"], modules });

    expect(enableModsAsync).toHaveBeenCalledWith(api, "p", ["a"]);
    expect(enableInProfileLoadOrderAsync).toHaveBeenCalledWith(
      api,
      "p",
      "multiplayer",
      modules,
    );
  });
});

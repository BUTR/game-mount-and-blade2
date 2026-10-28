import { describe, expect, it, vi } from "vitest";
import { bselectors } from "./selectors";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "./common";
import { IBannerlordMod, IStateWithBannerlord } from "./types";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: {
    activeProfile: (state: {
      settings: { profiles: { activeProfileId?: string } };
      persistent: { profiles: Record<string, unknown> };
    }) => {
      const id = state.settings.profiles.activeProfileId;
      return id !== undefined ? state.persistent.profiles[id] : undefined;
    },
  },
}));

vi.mock("@butr/vortexextensionnative", () => ({
  BannerlordModuleManager: {
    parseApplicationVersion: (value: string) => ({
      major: Number(/\d+/.exec(value)?.[0] ?? 0),
    }),
    compareVersions: (x: { major: number }, y: { major: number }) =>
      Math.sign(x.major - y.major),
  },
}));

interface StateOptions {
  profiles?: Record<string, unknown>;
  activeProfileId?: string;
  mods?: Record<string, IBannerlordMod>;
  loadOrder?: Record<string, unknown[]>;
  settings?: Record<string, unknown>;
  primaryTool?: string | null;
}

const makeState = (options: StateOptions = {}): IStateWithBannerlord =>
  ({
    persistent: {
      profiles: options.profiles ?? {},
      mods: options.mods !== undefined ? { [GAME_ID]: options.mods } : {},
      loadOrder: options.loadOrder,
      downloads: { files: {} },
    },
    settings: {
      profiles: { activeProfileId: options.activeProfileId },
      [GAME_ID]: options.settings,
      interface: { primaryTool: { [GAME_ID]: options.primaryTool } },
    },
    session: {},
  }) as unknown as IStateWithBannerlord;

const profile = (id: string, features?: Record<string, unknown>): unknown => ({
  id,
  gameId: GAME_ID,
  ...(features !== undefined && { features }),
});

describe("gameModeForProfile", () => {
  it("is multiplayer only when the feature is exactly true", () => {
    const state = makeState({
      profiles: {
        mp: profile("mp", { [MULTIPLAYER_PROFILE_FEATURE]: true }),
        sp: profile("sp", { [MULTIPLAYER_PROFILE_FEATURE]: false }),
        untyped: profile("untyped"),
        stringy: profile("stringy", { [MULTIPLAYER_PROFILE_FEATURE]: "yes" }),
      },
    });

    expect(bselectors.gameModeForProfile(state, "mp")).toBe("multiplayer");
    expect(bselectors.gameModeForProfile(state, "sp")).toBe("singleplayer");
    expect(bselectors.gameModeForProfile(state, "untyped")).toBe(
      "singleplayer",
    );
    expect(bselectors.gameModeForProfile(state, "stringy")).toBe(
      "singleplayer",
    );
  });

  it("is singleplayer for an unknown profile", () => {
    expect(bselectors.gameModeForProfile(makeState(), "missing")).toBe(
      "singleplayer",
    );
  });
});

describe("activeGameMode", () => {
  it("follows the active profile's type", () => {
    const state = makeState({
      profiles: { mp: profile("mp", { [MULTIPLAYER_PROFILE_FEATURE]: true }) },
      activeProfileId: "mp",
    });

    expect(bselectors.activeGameMode(state)).toBe("multiplayer");
  });

  it("is singleplayer without an active profile", () => {
    expect(bselectors.activeGameMode(makeState())).toBe("singleplayer");
  });
});

describe("bannerlordLoadOrder", () => {
  it("is empty without a profile or a stored load order", () => {
    const state = makeState({ loadOrder: { p1: [{ id: "A" }] } });

    expect(bselectors.bannerlordLoadOrder(state, undefined)).toEqual([]);
    expect(bselectors.bannerlordLoadOrder(state, "p2")).toEqual([]);
    expect(bselectors.bannerlordLoadOrder(state, "p1")).toEqual([{ id: "A" }]);
  });

  it("gives the active profile's load order", () => {
    const state = makeState({
      profiles: { p1: profile("p1") },
      activeProfileId: "p1",
      loadOrder: { p1: [{ id: "A" }], p2: [{ id: "B" }] },
    });

    expect(bselectors.bannerlordActiveLoadOrder(state)).toEqual([{ id: "A" }]);
  });
});

describe("per-profile settings", () => {
  it("are null until set, so a default can be told apart from false", () => {
    const state = makeState({
      settings: {
        sortOnDeploy: { p1: false },
        fixCommonIssues: {},
        betaSorting: { p1: true },
      },
    });

    expect(bselectors.sortOnDeployForProfile(state, "p1")).toBe(false);
    expect(bselectors.sortOnDeployForProfile(state, "p2")).toBeNull();
    expect(bselectors.fixCommonIssuesForProfile(state, "p1")).toBeNull();
    expect(bselectors.betaSortingForProfile(state, "p1")).toBe(true);
    expect(bselectors.sortOnDeployForProfile(makeState(), "p1")).toBeNull();
  });
});

describe("primary tools", () => {
  it("tells a mode without a remembered tool from one that launches the game", () => {
    const state = makeState({
      settings: { modePrimaryTool: { multiplayer: null } },
    });

    expect(bselectors.modePrimaryTool(state, "multiplayer")).toBeNull();
    expect(bselectors.modePrimaryTool(state, "singleplayer")).toBeUndefined();
  });

  it("keeps null as Vortex's choice of the game itself", () => {
    expect(
      bselectors.bannerlordPrimaryTool(makeState({ primaryTool: null })),
    ).toBeNull();
    expect(
      bselectors.bannerlordPrimaryTool(makeState({ primaryTool: "blse-cli" })),
    ).toBe("blse-cli");
  });

  it("gives the same empty hidden tools object while none are hidden", () => {
    expect(bselectors.modeHiddenTools(makeState())).toBe(
      bselectors.modeHiddenTools(makeState({ settings: {} })),
    );
  });
});

describe("blseMod", () => {
  it("finds BLSE by its mod type or by its Nexus Mods page", () => {
    const byType = {
      id: "blse-local",
      type: "bannerlord-blse",
    } as unknown as IBannerlordMod;
    const byPage = {
      id: "blse-nexus",
      type: "",
      attributes: { modId: 1, source: "nexus" },
    } as unknown as IBannerlordMod;
    const other = {
      id: "other",
      type: "",
      attributes: { modId: 1, source: "website" },
    } as unknown as IBannerlordMod;

    expect(bselectors.blseMod(makeState({ mods: { byType, other } }))).toBe(
      byType,
    );
    expect(bselectors.blseMod(makeState({ mods: { byPage, other } }))).toBe(
      byPage,
    );
    expect(bselectors.blseMod(makeState({ mods: { other } }))).toBeUndefined();
    expect(bselectors.blseMod(makeState())).toBeUndefined();
  });
});

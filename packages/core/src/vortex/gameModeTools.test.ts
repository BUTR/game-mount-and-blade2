import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  applyGameModeTools,
  isToolOfGameMode,
  rememberPrimaryTool,
  watchBLSEState,
  watchPrimaryTool,
} from "./gameModeTools";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { actionsSettings } from "../settings/actions";
import { IStateWithBannerlord } from "../types";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  type State = {
    settings: {
      profiles: { activeProfileId?: string };
      gameMode: { discovered: Record<string, unknown> };
    };
    persistent: { profiles: Record<string, { gameId: string }> };
  };
  const activeProfile = (state: State) => {
    const id = state.settings.profiles.activeProfileId;
    return id !== undefined ? state.persistent.profiles[id] : undefined;
  };
  Object.assign(api.selectors, {
    activeProfile,
    activeGameId: (state: State) => activeProfile(state)?.gameId,
    discoveryByGame: (state: State, gameId: string) =>
      state.settings.gameMode.discovered[gameId],
  });
  const action =
    (type: string) =>
    (...args: unknown[]) => ({ type, args });
  Object.assign(api.actions, {
    addDiscoveredTool: action("ADD_DISCOVERED_TOOL"),
    setToolVisible: action("SET_TOOL_VISIBLE"),
    setPrimaryTool: action("SET_PRIMARY_TOOL"),
  });
  Object.assign(api.util, {
    batchDispatch: (dispatch: (action: unknown) => void, actions: unknown[]) =>
      actions.forEach(dispatch),
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));

const ALL_TOOLS = [
  "blse-cli",
  "blse-launcher",
  "blse-launcherex",
  "vanilla-cli",
  "vanilla-mp-cli",
  "vanilla-launcher",
  "bannerlord-sdk",
];

interface Options {
  gameMode?: "singleplayer" | "multiplayer";
  activeGame?: string;
  blse?: "enabled" | "disabled" | "missing";
  tools?: Record<string, Partial<types.IDiscoveredTool>>;
  primaryTool?: string | null;
  modePrimaryTool?: Record<string, string | null>;
  modeHiddenTools?: Record<string, true>;
}

const discoveredTools = (
  ids: string[] = ALL_TOOLS,
): Record<string, Partial<types.IDiscoveredTool>> =>
  Object.fromEntries(
    ids.map((id) => [id, { id, path: `C:\\Game\\bin\\${id}.exe` }]),
  );

const makeState = (options: Options = {}): IStateWithBannerlord => {
  const blse = options.blse ?? "enabled";
  return {
    persistent: {
      profiles: {
        p1: {
          id: "p1",
          gameId: options.activeGame ?? GAME_ID,
          modState: { blse: { enabled: blse === "enabled" } },
          features: {
            [MULTIPLAYER_PROFILE_FEATURE]:
              (options.gameMode ?? "singleplayer") === "multiplayer",
          },
        },
      },
      mods: {
        [GAME_ID]:
          blse !== "missing"
            ? { blse: { id: "blse", type: "bannerlord-blse" } }
            : {},
      },
    },
    settings: {
      profiles: { activeProfileId: "p1" },
      gameMode: {
        discovered: {
          [GAME_ID]: {
            path: "C:\\Game",
            tools: options.tools ?? discoveredTools(),
          },
        },
      },
      interface: { primaryTool: { [GAME_ID]: options.primaryTool } },
      [GAME_ID]: {
        modePrimaryTool: options.modePrimaryTool ?? {},
        modeHiddenTools: options.modeHiddenTools ?? {},
      },
    },
    session: {},
  } as unknown as IStateWithBannerlord;
};

const makeApi = (initial: IStateWithBannerlord) => {
  let state = initial;
  const dispatched: { type: string; args?: unknown[]; payload?: unknown }[] =
    [];
  const handlers: { path: string[]; handler: (...args: unknown[]) => void }[] =
    [];
  const api = {
    getState: () => state,
    store: {
      dispatch: (action: (typeof dispatched)[number]) => {
        dispatched.push(action);
      },
    },
    onStateChange: (path: string[], handler: (...args: unknown[]) => void) => {
      handlers.push({ path, handler });
    },
  };
  return {
    api: api as unknown as types.IExtensionApi,
    dispatched,
    setState: (next: IStateWithBannerlord) => {
      state = next;
    },
    emit: (path: string, ...args: unknown[]) => {
      for (const entry of handlers) {
        if (entry.path.join(".") === path) {
          entry.handler(...args);
        }
      }
    },
  };
};

const primaryToolSet = (dispatched: { type: string; args?: unknown[] }[]) =>
  dispatched
    .filter((action) => action.type === "SET_PRIMARY_TOOL")
    .map((action) => action.args?.[1]);

const visibility = (dispatched: { type: string; args?: unknown[] }[]) =>
  Object.fromEntries(
    dispatched
      .filter((action) => action.type === "SET_TOOL_VISIBLE")
      .map((action) => [action.args?.[1], action.args?.[2]]),
  );

const modeHidden = (dispatched: { type: string; payload?: unknown }[]) =>
  Object.fromEntries(
    dispatched
      .filter(
        (action) => action.type === actionsSettings.setModeHiddenTool.getType(),
      )
      .map((action) => {
        const { toolId, hidden } = action.payload as {
          toolId: string;
          hidden: boolean;
        };
        return [toolId, hidden];
      }),
  );

const rememberedTools = (dispatched: { type: string; payload?: unknown }[]) =>
  dispatched
    .filter(
      (action) => action.type === actionsSettings.setModePrimaryTool.getType(),
    )
    .map((action) => action.payload);

describe("isToolOfGameMode", () => {
  it("keeps each mode's tools out of the other mode", () => {
    expect(isToolOfGameMode("blse-cli", "multiplayer")).toBe(false);
    expect(isToolOfGameMode("vanilla-cli", "multiplayer")).toBe(false);
    expect(isToolOfGameMode("bannerlord-sdk", "multiplayer")).toBe(false);
    expect(isToolOfGameMode("vanilla-mp-cli", "singleplayer")).toBe(false);
    expect(isToolOfGameMode("blse-cli", "singleplayer")).toBe(true);
    expect(isToolOfGameMode("vanilla-mp-cli", "multiplayer")).toBe(true);
  });

  it("runs tools of neither mode in both", () => {
    expect(isToolOfGameMode("vanilla-launcher", "singleplayer")).toBe(true);
    expect(isToolOfGameMode("vanilla-launcher", "multiplayer")).toBe(true);
    expect(isToolOfGameMode("some-custom-tool", "multiplayer")).toBe(true);
  });
});

describe("applyGameModeTools", () => {
  it("does nothing while another game is managed", () => {
    const { api, dispatched } = makeApi(
      makeState({ activeGame: "skyrimse", gameMode: "multiplayer" }),
    );

    applyGameModeTools(api);

    expect(dispatched).toEqual([]);
  });

  it("hides the singleplayer tools in multiplayer and remembers hiding them", () => {
    const tools = discoveredTools();
    tools["blse-launcherex"] = { ...tools["blse-launcherex"]!, hidden: true };
    delete tools["bannerlord-sdk"];
    const { api, dispatched } = makeApi(
      makeState({ gameMode: "multiplayer", tools }),
    );

    applyGameModeTools(api);

    expect(visibility(dispatched)).toEqual({
      "blse-cli": false,
      "blse-launcher": false,
      "vanilla-cli": false,
    });
    expect(modeHidden(dispatched)).toEqual({
      "blse-cli": true,
      "blse-launcher": true,
      "vanilla-cli": true,
    });
  });

  it("makes a custom tool non-custom before hiding it, Vortex deletes hidden custom tools", () => {
    const tools = discoveredTools(["blse-cli", "vanilla-mp-cli"]);
    tools["blse-cli"] = { ...tools["blse-cli"]!, custom: true };
    const { api, dispatched } = makeApi(
      makeState({ gameMode: "multiplayer", tools }),
    );

    applyGameModeTools(api);

    const types = dispatched.map((action) => action.type);
    const readded = dispatched.find(
      (action) => action.type === "ADD_DISCOVERED_TOOL",
    );
    expect(readded?.args?.[2]).toMatchObject({ id: "blse-cli", custom: false });
    expect(types.indexOf("ADD_DISCOVERED_TOOL")).toBeLessThan(
      types.indexOf("SET_TOOL_VISIBLE"),
    );
  });

  it("shows again only the tools it hid, forgetting those no longer discovered", () => {
    const tools = discoveredTools([
      "blse-cli",
      "vanilla-cli",
      "vanilla-mp-cli",
    ]);
    const { api, dispatched } = makeApi(
      makeState({
        gameMode: "singleplayer",
        tools,
        primaryTool: "blse-cli",
        modeHiddenTools: { "blse-cli": true, "bannerlord-sdk": true },
      }),
    );

    applyGameModeTools(api);

    expect(visibility(dispatched)).toEqual({
      "blse-cli": true,
      "vanilla-mp-cli": false,
    });
    expect(modeHidden(dispatched)).toEqual({
      "blse-cli": false,
      "bannerlord-sdk": false,
      "vanilla-mp-cli": true,
    });
  });

  describe("the primary tool", () => {
    const resolve = (options: Options) => {
      const { api, dispatched } = makeApi(makeState(options));
      applyGameModeTools(api);
      return primaryToolSet(dispatched);
    };

    it("is the multiplayer game in multiplayer when the current one is singleplayer's", () => {
      expect(
        resolve({ gameMode: "multiplayer", primaryTool: "blse-cli" }),
      ).toEqual(["vanilla-mp-cli"]);
    });

    it("is the mode's remembered tool", () => {
      expect(
        resolve({
          gameMode: "singleplayer",
          primaryTool: "vanilla-mp-cli",
          modePrimaryTool: { singleplayer: "blse-launcherex" },
        }),
      ).toEqual(["blse-launcherex"]);
    });

    it("is kept when nothing is remembered and it runs in the mode", () => {
      expect(
        resolve({ gameMode: "multiplayer", primaryTool: "vanilla-launcher" }),
      ).toEqual([]);
    });

    it("is the game itself when that was remembered", () => {
      expect(
        resolve({
          gameMode: "singleplayer",
          primaryTool: "blse-cli",
          modePrimaryTool: { singleplayer: null },
        }),
      ).toEqual([null]);
    });

    it("falls back to the game when the profile doesn't enable BLSE", () => {
      expect(
        resolve({
          gameMode: "singleplayer",
          blse: "disabled",
          primaryTool: "vanilla-mp-cli",
          modePrimaryTool: { singleplayer: "blse-cli" },
        }),
      ).toEqual(["vanilla-cli"]);
      expect(
        resolve({
          gameMode: "singleplayer",
          blse: "missing",
          primaryTool: "blse-cli",
        }),
      ).toEqual(["vanilla-cli"]);
    });

    it("is BLSE by default in singleplayer when the profile enables it", () => {
      expect(
        resolve({ gameMode: "singleplayer", primaryTool: "vanilla-mp-cli" }),
      ).toEqual(["blse-cli"]);
    });

    it("skips tools that weren't found on disk", () => {
      const tools = discoveredTools(["vanilla-cli", "vanilla-mp-cli"]);
      tools["blse-cli"] = { id: "blse-cli" };
      expect(
        resolve({
          gameMode: "singleplayer",
          tools,
          primaryTool: "vanilla-mp-cli",
        }),
      ).toEqual(["vanilla-cli"]);
    });
  });
});

describe("rememberPrimaryTool", () => {
  const remember = (options: Options) => {
    const { api, dispatched } = makeApi(makeState(options));
    rememberPrimaryTool(api);
    return rememberedTools(dispatched);
  };

  it("remembers the current tool for the active mode", () => {
    expect(
      remember({ gameMode: "singleplayer", primaryTool: "blse-launcherex" }),
    ).toEqual([{ gameMode: "singleplayer", toolId: "blse-launcherex" }]);
    expect(remember({ gameMode: "multiplayer", primaryTool: null })).toEqual([
      { gameMode: "multiplayer", toolId: null },
    ]);
  });

  it("doesn't remember a tool of the other mode, an unset tool or the same tool again", () => {
    expect(
      remember({ gameMode: "multiplayer", primaryTool: "blse-cli" }),
    ).toEqual([]);
    expect(remember({ gameMode: "singleplayer" })).toEqual([]);
    expect(
      remember({
        gameMode: "singleplayer",
        primaryTool: "blse-cli",
        modePrimaryTool: { singleplayer: "blse-cli" },
      }),
    ).toEqual([]);
  });

  it("keeps a remembered BLSE tool while the profile doesn't enable BLSE", () => {
    expect(
      remember({
        gameMode: "singleplayer",
        blse: "disabled",
        primaryTool: "vanilla-cli",
        modePrimaryTool: { singleplayer: "blse-cli" },
      }),
    ).toEqual([]);
  });
});

describe("watchPrimaryTool", () => {
  const PRIMARY_TOOL = `settings.interface.primaryTool.${GAME_ID}`;

  it("remembers a tool the user picks", () => {
    const { api, dispatched, emit } = makeApi(
      makeState({ gameMode: "singleplayer", primaryTool: "vanilla-cli" }),
    );
    watchPrimaryTool(api);

    emit(PRIMARY_TOOL, "blse-cli", "vanilla-cli");

    expect(rememberedTools(dispatched)).toEqual([
      { gameMode: "singleplayer", toolId: "vanilla-cli" },
    ]);
  });

  it("restores the mode's tool when Vortex picks one that can't launch in the mode", () => {
    const { api, dispatched, emit } = makeApi(
      makeState({ gameMode: "multiplayer", primaryTool: "blse-cli" }),
    );
    watchPrimaryTool(api);

    emit(PRIMARY_TOOL, undefined, "blse-cli");

    expect(primaryToolSet(dispatched)).toEqual(["vanilla-mp-cli"]);
    expect(rememberedTools(dispatched)).toEqual([]);
  });

  it("doesn't remember the stand-in for a suspended BLSE tool", () => {
    const { api, dispatched, emit } = makeApi(
      makeState({
        gameMode: "singleplayer",
        blse: "disabled",
        primaryTool: "vanilla-cli",
        modePrimaryTool: { singleplayer: "blse-cli" },
      }),
    );
    watchPrimaryTool(api);

    emit(PRIMARY_TOOL, "blse-cli", "vanilla-cli");

    expect(dispatched).toEqual([]);
  });

  it("remembers the game itself when the user picks it", () => {
    const { api, dispatched, emit } = makeApi(
      makeState({ gameMode: "singleplayer", primaryTool: null }),
    );
    watchPrimaryTool(api);

    emit(PRIMARY_TOOL, "blse-cli", null);

    expect(rememberedTools(dispatched)).toEqual([
      { gameMode: "singleplayer", toolId: null },
    ]);
    expect(primaryToolSet(dispatched)).toEqual([]);
  });

  it("ignores an unset tool and changes while another game is managed", () => {
    const unset = makeApi(makeState({ gameMode: "singleplayer" }));
    watchPrimaryTool(unset.api);
    unset.emit(PRIMARY_TOOL, "blse-cli", undefined);

    const other = makeApi(
      makeState({
        activeGame: "skyrimse",
        gameMode: "multiplayer",
        primaryTool: "blse-cli",
      }),
    );
    watchPrimaryTool(other.api);
    other.emit(PRIMARY_TOOL, undefined, "blse-cli");

    expect(unset.dispatched).toEqual([]);
    expect(other.dispatched).toEqual([]);
  });
});

describe("watchBLSEState", () => {
  it("picks the tool again once BLSE is installed", () => {
    const options: Options = {
      gameMode: "singleplayer",
      blse: "missing",
      primaryTool: "vanilla-cli",
      modePrimaryTool: { singleplayer: "blse-cli" },
    };
    const { api, dispatched, emit, setState } = makeApi(makeState(options));
    watchBLSEState(api);

    setState(makeState({ ...options, blse: "enabled" }));
    emit(`persistent.mods.${GAME_ID}`);

    expect(primaryToolSet(dispatched)).toEqual(["blse-cli"]);
  });

  it("leaves a profile switch to profile-did-change, which picks the tool itself", () => {
    const options: Options = {
      gameMode: "singleplayer",
      blse: "disabled",
      primaryTool: "vanilla-cli",
      modePrimaryTool: { singleplayer: "blse-cli" },
    };
    const { api, dispatched, emit, setState } = makeApi(makeState(options));
    watchBLSEState(api);

    setState(makeState({ ...options, blse: "enabled" }));
    emit("settings.profiles.activeProfileId");
    emit("persistent.profiles");

    expect(dispatched).toEqual([]);
  });

  it("picks the tool again once the profile enables BLSE", () => {
    const options: Options = {
      gameMode: "singleplayer",
      blse: "disabled",
      primaryTool: "vanilla-cli",
      modePrimaryTool: { singleplayer: "blse-cli" },
    };
    const { api, dispatched, emit, setState } = makeApi(makeState(options));
    watchBLSEState(api);

    emit("persistent.profiles");
    expect(dispatched).toEqual([]);

    setState(makeState({ ...options, blse: "enabled" }));
    emit("persistent.profiles");

    expect(primaryToolSet(dispatched)).toEqual(["blse-cli"]);
  });
});

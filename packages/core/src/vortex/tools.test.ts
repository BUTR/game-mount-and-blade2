import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import path from "node:path";
import {
  addBLSETools,
  addModdingKitTool,
  addOfficialCLITool,
  addOfficialLauncherTool,
  addOfficialMultiplayerCLITool,
} from "./tools";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.actions, {
    addDiscoveredTool: (
      _gameId: string,
      _toolId: string,
      tool: types.IDiscoveredTool,
    ) => ({ type: "ADD_DISCOVERED_TOOL", tool }),
    setToolVisible: (_gameId: string, toolId: string, visible: boolean) => ({
      type: "SET_TOOL_VISIBLE",
      toolId,
      visible,
    }),
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));

const GAME_PATH = "C:\\Games\\Bannerlord";

const run = (
  add: (api: types.IExtensionApi, discovery: types.IDiscoveryResult) => void,
  discovery: Partial<types.IDiscoveryResult>,
) => {
  const dispatched: {
    type: string;
    tool?: types.IDiscoveredTool;
    toolId?: string;
    visible?: boolean;
  }[] = [];
  const api = {
    store: {
      dispatch: (action: (typeof dispatched)[number]) =>
        dispatched.push(action),
    },
  } as unknown as types.IExtensionApi;
  add(api, discovery as types.IDiscoveryResult);
  return dispatched;
};

describe("official tools", () => {
  it("adds the game, its multiplayer launch and the launcher from the store's binary folder", () => {
    const discovery = { path: GAME_PATH, store: "gog" };
    const [cli] = run(addOfficialCLITool, discovery);
    const [multiplayer] = run(addOfficialMultiplayerCLITool, discovery);
    const [launcher] = run(addOfficialLauncherTool, discovery);
    const binaries = path.join(GAME_PATH, "bin", "Win64_Shipping_Client");

    expect(cli?.tool).toMatchObject({
      id: "vanilla-cli",
      path: path.join(binaries, "Bannerlord.exe"),
      requiredFiles: ["Bannerlord.exe"],
      custom: false,
      hidden: false,
    });
    expect(multiplayer?.tool).toMatchObject({
      id: "vanilla-mp-cli",
      path: path.join(binaries, "Bannerlord.exe"),
    });
    expect(launcher?.tool).toMatchObject({
      id: "vanilla-launcher",
      path: path.join(binaries, "TaleWorlds.MountAndBlade.Launcher.exe"),
    });
    // Only BLSE is a default, otherwise Vortex would pick one of these over it
    for (const action of [cli, multiplayer, launcher]) {
      expect(action?.tool?.defaultPrimary).toBeUndefined();
    }
  });
});

describe("addBLSETools", () => {
  it("adds BLSE's tools in the store's binary folder, the CLI as the default", () => {
    const tools = run(addBLSETools, { path: GAME_PATH, store: "xbox" }).map(
      (action) => action.tool!,
    );

    expect(tools.map((tool) => tool.id)).toEqual([
      "blse-cli",
      "blse-launcher",
      "blse-launcherex",
    ]);
    expect(tools[0]?.path).toBe(
      path.join(
        GAME_PATH,
        "bin",
        "Gaming.Desktop.x64_Shipping_Client",
        "Bannerlord.BLSE.Standalone.exe",
      ),
    );
    expect(tools.map((tool) => tool.defaultPrimary)).toEqual([
      true,
      undefined,
      undefined,
    ]);
    // Vortex deletes custom tools instead of hiding them
    expect(tools.every((tool) => tool.custom === false)).toBe(true);
  });

  it("requires a game folder", () => {
    expect(() => run(addOfficialCLITool, { store: "steam" })).toThrow();
  });
});

describe("addModdingKitTool", () => {
  it("adds the Modding Kit for Steam, from the editor's binary folder", () => {
    const [action] = run(addModdingKitTool, {
      path: GAME_PATH,
      store: "steam",
    });

    expect(action?.tool).toMatchObject({
      id: "bannerlord-sdk",
      exclusive: true,
      hidden: false,
      path: path.join(
        GAME_PATH,
        "bin",
        "Win64_Shipping_wEditor",
        "TaleWorlds.MountAndBlade.Launcher.exe",
      ),
    });
  });

  it("hides one added for Steam after the game moved to another store", () => {
    const dispatched = run(addModdingKitTool, {
      path: GAME_PATH,
      store: "gog",
      tools: {
        "bannerlord-sdk": { id: "bannerlord-sdk" } as types.IDiscoveredTool,
      },
    });

    expect(dispatched).toEqual([
      { type: "SET_TOOL_VISIBLE", toolId: "bannerlord-sdk", visible: false },
    ]);
  });

  it("can be added hidden", () => {
    const [action] = run(
      (api, discovery) => addModdingKitTool(api, discovery, true),
      { path: GAME_PATH, store: "steam" },
    );

    expect(action?.tool).toMatchObject({ id: "bannerlord-sdk", hidden: true });
  });

  it("adds nothing for other stores or without a store", () => {
    expect(run(addModdingKitTool, { path: GAME_PATH, store: "epic" })).toEqual(
      [],
    );
    expect(run(addModdingKitTool, { path: GAME_PATH })).toEqual([]);
  });
});

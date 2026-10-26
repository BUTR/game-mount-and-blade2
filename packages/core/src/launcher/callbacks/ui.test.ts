import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectors, types, util } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import {
  getInstallPathCallback,
  getOptionsCallback,
  getStateCallback,
  sendDialogCallback,
  sendNotificationCallback,
  setGameParametersCallback,
  withFileDialogExtensionsAsync,
} from "./ui";
import { bselectors } from "../../selectors";
import { GAME_ID } from "../../common";
import { GameMode } from "../../settings/types";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: { activeProfile: vi.fn(), discoveryByGame: vi.fn() },
  actions: {
    addDiscoveredTool: vi.fn(
      (_gameId: string, toolId: string, tool: unknown) => ({
        type: "ADD_DISCOVERED_TOOL",
        toolId,
        tool,
      }),
    ),
    setGameParameters: vi.fn((_gameId: string, parameters: unknown) => ({
      type: "SET_GAME_PARAMETERS",
      parameters,
    })),
  },
  util: { batchDispatch: vi.fn() },
}));

vi.mock("../../selectors", () => ({
  bselectors: { activeGameMode: vi.fn(), betaSortingForProfile: vi.fn() },
}));

vi.mock("../../vortex/gameModeTools", () => ({
  isToolOfGameMode: (toolId: string, gameMode: GameMode): boolean =>
    gameMode === "multiplayer"
      ? !["blse-cli", "vanilla-cli"].includes(toolId)
      : toolId !== "vanilla-mp-cli",
}));

vi.mock("../../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

type DispatchedAction = {
  type: string;
  toolId?: string;
  tool?: types.IDiscoveredTool;
  parameters?: { parameters: string[] };
};

const createApi = (overrides: Partial<types.IExtensionApi> = {}) =>
  ({
    getState: () => ({}),
    store: { dispatch: vi.fn() },
    sendNotification: vi.fn(),
    showDialog: vi.fn(),
    selectFile: vi.fn(),
    saveFile: vi.fn(),
    ...overrides,
  }) as unknown as types.IExtensionApi;

const tool = (id: string): types.IDiscoveredTool =>
  ({
    id,
    path: `C:/${id}.exe`,
    parameters: [],
  }) as unknown as types.IDiscoveredTool;

const dispatched = (): DispatchedAction[] =>
  vi.mocked(util.batchDispatch).mock.calls[0]![1] as DispatchedAction[];

const gameParameters = (): string[] | undefined =>
  dispatched().find((x) => x.type === "SET_GAME_PARAMETERS")?.parameters
    ?.parameters;

const toolParameters = (): Record<string, unknown> =>
  Object.fromEntries(
    dispatched()
      .filter((x) => x.type === "ADD_DISCOVERED_TOOL")
      .map((x) => [x.toolId, x.tool?.parameters]),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(selectors.discoveryByGame).mockReturnValue({
    tools: {
      "blse-cli": tool("blse-cli"),
      "vanilla-cli": tool("vanilla-cli"),
      "vanilla-mp-cli": tool("vanilla-mp-cli"),
      "blse-launcher": tool("blse-launcher"),
    },
  } as unknown as types.IDiscoveryResult);
});

describe("setGameParametersCallback", () => {
  const launcherParameters = [
    "/singleplayer",
    "_MODULES_*Native*SandBox*_MODULES_",
    "/continuesave",
    "save1",
    "",
    " ",
  ];

  it("in singleplayer, passes the parameters to the game and the singleplayer CLI tools", async () => {
    vi.mocked(bselectors.activeGameMode).mockReturnValue("singleplayer");

    await setGameParametersCallback(createApi())(
      "Bannerlord.exe",
      launcherParameters,
    );

    const expected = [
      "/singleplayer _MODULES_*Native*SandBox*_MODULES_ /continuesave save1",
    ];
    expect(gameParameters()).toEqual(expected);
    expect(toolParameters()).toEqual({
      "blse-cli": expected,
      "vanilla-cli": expected,
    });
  });

  it("in multiplayer, swaps the mode argument, drops the save and only touches multiplayer CLI tools", async () => {
    vi.mocked(bselectors.activeGameMode).mockReturnValue("multiplayer");

    await setGameParametersCallback(createApi())("Bannerlord.exe", [
      "/singleplayer",
      "_MODULES_*Native*Multiplayer*_MODULES_",
      "/continuesave",
      "/continuegame",
    ]);

    const expected = ["/multiplayer _MODULES_*Native*Multiplayer*_MODULES_"];
    expect(gameParameters()).toEqual(expected);
    expect(toolParameters()).toEqual({ "vanilla-mp-cli": expected });
  });

  it("does nothing without a store", async () => {
    vi.mocked(bselectors.activeGameMode).mockReturnValue("singleplayer");
    const api = { getState: () => ({}) } as unknown as types.IExtensionApi;

    await expect(
      setGameParametersCallback(api)("Bannerlord.exe", ["/singleplayer"]),
    ).resolves.toBeUndefined();
    expect(util.batchDispatch).not.toHaveBeenCalled();
  });
});

describe("sendNotificationCallback", () => {
  it.each([
    ["hint", "activity"],
    ["info", "info"],
    ["warning", "warning"],
    ["error", "error"],
  ] as const)(
    "shows a %s as a Vortex %s notification",
    async (type, expected) => {
      const api = createApi();

      await sendNotificationCallback(api)("id1", type, "message", 3000);

      expect(api.sendNotification).toHaveBeenCalledWith({
        id: "id1",
        type: expected,
        message: "message",
        displayMS: 3000,
      });
    },
  );
});

describe("sendDialogCallback", () => {
  const filters: vetypes.FileFilter[] = [
    { name: "LauncherEx", extensions: ["*.bmlist"] },
    { name: "Novus", extensions: ["*.xml"] },
    { name: "All", extensions: ["*.*"] },
  ];

  it.each([
    ["Yes", "true"],
    ["No", "false"],
    [undefined, ""],
  ])(
    "answers a warning dialog closed with %s as %j",
    async (action, expected) => {
      const api = createApi({
        showDialog: vi.fn(async () => ({ action, input: {} })),
      } as unknown as Partial<types.IExtensionApi>);

      const result = await sendDialogCallback(api)(
        "warning",
        "Title",
        "First--CONTENT-SPLIT--Second",
        [],
      );

      expect(result).toBe(expected);
      expect(api.showDialog).toHaveBeenCalledWith(
        "question",
        "Title",
        { message: "First\nSecond" },
        [{ label: "No" }, { label: "Yes" }],
      );
    },
  );

  it("opens a file with the globs turned into bare extensions, whatever the type's case", async () => {
    const api = createApi({
      selectFile: vi.fn(async () => "C:/list.bmlist"),
    } as unknown as Partial<types.IExtensionApi>);

    const result = await sendDialogCallback(api)(
      "fileopen" as vetypes.DialogType,
      "Import",
      "",
      filters,
    );

    expect(result).toBe("C:/list.bmlist");
    expect(api.selectFile).toHaveBeenCalledWith({
      title: "Import",
      filters: [
        { name: "LauncherEx", extensions: ["bmlist"] },
        { name: "Novus", extensions: ["xml"] },
        { name: "All", extensions: ["*"] },
      ],
    });
  });

  it("answers a cancelled file dialog with an empty string", async () => {
    const api = createApi({
      selectFile: vi.fn(async () => undefined),
      saveFile: vi.fn(async () => undefined),
    } as unknown as Partial<types.IExtensionApi>);

    expect(await sendDialogCallback(api)("fileOpen", "", "", filters)).toBe("");
    expect(await sendDialogCallback(api)("fileSave", "", "", filters)).toBe("");
  });

  it("saves to the path the launcher suggests", async () => {
    const api = createApi({
      saveFile: vi.fn(async () => "C:/out.xml"),
    } as unknown as Partial<types.IExtensionApi>);

    const result = await sendDialogCallback(api)(
      "fileSave",
      "Export",
      "C:/default.xml",
      filters,
    );

    expect(result).toBe("C:/out.xml");
    expect(api.saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "C:/default.xml" }),
    );
  });

  it("offers only the requested format's filter inside withFileDialogExtensionsAsync", async () => {
    const api = createApi({
      selectFile: vi.fn(async () => ""),
    } as unknown as Partial<types.IExtensionApi>);
    const dialog = sendDialogCallback(api);

    await withFileDialogExtensionsAsync(["*.xml"], () =>
      dialog("fileOpen", "", "", filters),
    );
    await dialog("fileOpen", "", "", filters);

    const calls = vi.mocked(api.selectFile).mock.calls;
    expect(calls[0]![0].filters).toEqual([
      { name: "Novus", extensions: ["xml"] },
    ]);
    expect(calls[1]![0].filters).toHaveLength(3);
  });

  it("stops narrowing the filters when the call fails", async () => {
    const api = createApi({
      selectFile: vi.fn(async () => ""),
    } as unknown as Partial<types.IExtensionApi>);

    await expect(
      withFileDialogExtensionsAsync(["*.xml"], () =>
        Promise.reject(new Error("failed")),
      ),
    ).rejects.toThrow("failed");
    await sendDialogCallback(api)("fileOpen", "", "", filters);

    expect(vi.mocked(api.selectFile).mock.calls[0]![0].filters).toHaveLength(3);
  });

  it("answers an unknown dialog type with an empty string", async () => {
    const result = await sendDialogCallback(createApi())(
      "other" as vetypes.DialogType,
      "",
      "",
      [],
    );

    expect(result).toBe("");
  });
});

describe("getOptionsCallback", () => {
  it("uses the active profile's beta sorting", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue({
      id: "p1",
    } as types.IProfile);
    vi.mocked(bselectors.betaSortingForProfile).mockReturnValue(true);

    expect(await getOptionsCallback(createApi())()).toEqual({
      betaSorting: true,
    });
  });

  it("turns beta sorting off without a profile or a setting", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue(undefined);
    expect(await getOptionsCallback(createApi())()).toEqual({
      betaSorting: false,
    });

    vi.mocked(selectors.activeProfile).mockReturnValue({
      id: "p1",
    } as types.IProfile);
    vi.mocked(bselectors.betaSortingForProfile).mockReturnValue(null);
    expect(await getOptionsCallback(createApi())()).toEqual({
      betaSorting: false,
    });
  });
});

describe("getStateCallback", () => {
  it("reports the active game mode", async () => {
    vi.mocked(bselectors.activeGameMode).mockReturnValue("multiplayer");
    expect(await getStateCallback(createApi())()).toEqual({
      isSingleplayer: false,
    });

    vi.mocked(bselectors.activeGameMode).mockReturnValue("singleplayer");
    expect(await getStateCallback(createApi())()).toEqual({
      isSingleplayer: true,
    });
  });
});

describe("getInstallPathCallback", () => {
  it("answers Bannerlord's folder, whichever game is active", async () => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue({
      path: "C:/Games/Bannerlord",
    } as types.IDiscoveryResult);
    const api = createApi();

    expect(await getInstallPathCallback(api)()).toBe("C:/Games/Bannerlord");
    expect(selectors.discoveryByGame).toHaveBeenCalledWith(
      api.getState(),
      GAME_ID,
    );
  });

  it("answers an empty path before the game is discovered", async () => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue(undefined);

    expect(await getInstallPathCallback(createApi())()).toBe("");
  });
});

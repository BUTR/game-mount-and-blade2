import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { VortexLauncherManager } from "./manager";
import { installModuleAsync } from "./installer";
import {
  getAllModuleViewModelsCallback,
  getModuleViewModelsCallback,
} from "./callbacks/modules";
import { withFileDialogExtensionsAsync } from "./callbacks/ui";
import { GAME_ID } from "../common";

const hoisted = vi.hoisted(() => ({
  // What the native manager was built with, and the order of the steps leading to it
  constructions: [] as unknown[][],
  steps: [] as string[],
}));

vi.mock("@butr/vortexextensionnative", () => {
  class NativeLauncherManager {
    public constructor(...args: unknown[]) {
      hoisted.constructions.push(args);
      hoisted.steps.push("native manager");
    }
    public refreshGameParametersAsync = vi.fn(async () => {
      hoisted.steps.push("refresh game parameters");
    });
    public refreshModulesAsync = vi.fn(async () => {
      hoisted.steps.push("refresh modules");
    });
    public setGameParameterLoadOrderAsync = vi.fn(async () => {
      hoisted.steps.push("set load order");
    });
    public setGameParameterSaveFileAsync = vi.fn(async () => {
      hoisted.steps.push("set save file");
    });
    public setGameParameterContinueLastSaveFileAsync = vi.fn(async () => {
      hoisted.steps.push("set continue last save");
    });
    public getModulesAsync = vi.fn(async () => []);
    public getAllModulesAsync = vi.fn(async () => []);
    public orderByLoadOrderAsync = vi.fn(async () => ({ result: true }));
    public getGameVersionAsync = vi.fn(async () => "v1.2.12.0");
    public testModule = vi.fn(() => ({
      supported: true,
      requiredFiles: ["SubModule.xml"],
    }));
    public isObfuscatedAsync = vi.fn(async () => false);
    public isSorting = vi.fn(() => false);
    public sortAsync = vi.fn(async () => undefined);
    public moduleListHandlerImportAsync = vi.fn(async () => true);
    public moduleListHandlerExportAsync = vi.fn(async () => undefined);
    public getSaveFilesAsync = vi.fn(async () => []);
    public getSaveFilePathAsync = vi.fn(async (name: string) => `${name}.sav`);
    public setGameStore = vi.fn();
  }
  return { NativeLauncherManager, types: {} };
});

vi.mock("./logger", () => ({
  ensureNativeLogger: vi.fn(() => {
    hoisted.steps.push("logger");
  }),
}));

vi.mock("./installer", () => ({
  installModuleAsync: vi.fn(async () => ({ instructions: [] })),
}));

// Each callback factory answers with a tag, so the wiring below can be told apart
vi.mock("./callbacks/modules", () => ({
  getAllModuleViewModelsCallback: vi.fn(() => "getAllModuleViewModels"),
  getModuleViewModelsCallback: vi.fn(() => "getModuleViewModels"),
  setModuleViewModelsCallback: vi.fn(() => "setModuleViewModels"),
}));

vi.mock("./callbacks/ui", () => ({
  getInstallPathCallback: vi.fn(() => "getInstallPath"),
  getOptionsCallback: vi.fn(() => "getOptions"),
  getStateCallback: vi.fn(() => "getState"),
  sendDialogCallback: vi.fn(() => "sendDialog"),
  sendNotificationCallback: vi.fn(() => "sendNotification"),
  setGameParametersCallback: vi.fn(() => "setGameParameters"),
  withFileDialogExtensionsAsync: vi.fn(
    (_extensions: readonly string[], action: () => Promise<unknown>) =>
      action(),
  ),
}));

vi.mock("./callbacks/fileIO", () => ({
  readDirectoryFileListCallback: vi.fn(() => "readDirectoryFileList"),
  readDirectoryListCallback: vi.fn(() => "readDirectoryList"),
  readFileContentCallback: vi.fn(() => "readFileContent"),
  writeFileContentCallback: vi.fn(() => "writeFileContent"),
}));

type NativeMock = InstanceType<
  typeof import("@butr/vortexextensionnative").NativeLauncherManager
> & {
  [K in keyof InstanceType<
    typeof import("@butr/vortexextensionnative").NativeLauncherManager
  >]: ReturnType<typeof vi.fn>;
};

const api = { id: "api" } as unknown as types.IExtensionApi;

const create = (): { manager: VortexLauncherManager; native: NativeMock } => {
  const manager = new VortexLauncherManager(api);
  const native = (manager as unknown as { launcherManager: NativeMock })
    .launcherManager;
  return { manager, native };
};

const module = (id: string): vetypes.ModuleInfoExtendedWithMetadata =>
  ({ id, name: id }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.constructions.length = 0;
  hoisted.steps.length = 0;
});

describe("VortexLauncherManager", () => {
  it("routes the native log to Vortex before loading the native manager", () => {
    create();

    expect(hoisted.steps).toEqual(["logger", "native manager"]);
  });

  it("hands the native manager its callbacks in its parameter order", () => {
    const { manager } = create();

    expect(hoisted.constructions).toEqual([
      [
        "setGameParameters",
        "sendNotification",
        "sendDialog",
        "getInstallPath",
        "readFileContent",
        "writeFileContent",
        "readDirectoryFileList",
        "readDirectoryList",
        "getAllModuleViewModels",
        "getModuleViewModels",
        "setModuleViewModels",
        "getOptions",
        "getState",
      ],
    ]);
    expect(getModuleViewModelsCallback).toHaveBeenCalledWith(
      api,
      manager.getAllModulesAsync,
    );
    expect(getAllModuleViewModelsCallback).toHaveBeenCalledWith(
      api,
      manager.getAllModulesAsync,
      "getModuleViewModels",
    );
  });

  it("keeps one instance for the extension", () => {
    const first = VortexLauncherManager.getInstance(api);
    const second = VortexLauncherManager.getInstance(api);

    expect(second).toBe(first);
    expect(hoisted.constructions.length).toBeLessThanOrEqual(1);
  });

  it("keys the native manager's modules by id", async () => {
    const { manager, native } = create();
    native.getModulesAsync.mockResolvedValue([module("Native"), module("A")]);

    const modules = await manager.getAllModulesAsync();

    expect(Object.keys(modules)).toEqual(["Native", "A"]);
    expect(modules["A"]?.name).toBe("A");
  });

  it("refreshes the game parameters after the modules or a parameter change", async () => {
    const { manager, native } = create();
    hoisted.steps.length = 0;

    await manager.refreshModulesAsync();
    await manager.setModulesToLaunchAsync({});
    await manager.setSaveFileAsync("save1");
    await manager.setContinueLastSaveFileAsync(true);

    expect(hoisted.steps).toEqual([
      "refresh modules",
      "refresh game parameters",
      "set load order",
      "refresh game parameters",
      "set save file",
      "refresh game parameters",
      "set continue last save",
      "refresh game parameters",
    ]);
    expect(native.setGameParameterSaveFileAsync).toHaveBeenCalledWith("save1");
    expect(
      native.setGameParameterContinueLastSaveFileAsync,
    ).toHaveBeenCalledWith(true);
  });

  it("supports only Bannerlord's archives, as the native manager judges them", async () => {
    const { manager, native } = create();

    expect(await manager.testModule(["SubModule.xml"], "skyrimse")).toEqual({
      supported: false,
      requiredFiles: [],
    });
    expect(native.testModule).not.toHaveBeenCalled();

    expect(await manager.testModule(["SubModule.xml"], GAME_ID)).toEqual({
      supported: true,
      requiredFiles: ["SubModule.xml"],
    });
    expect(native.testModule).toHaveBeenCalledWith(["SubModule.xml"]);
  });

  it("installs through the installer with the native manager", async () => {
    const { manager, native } = create();

    await manager.installModuleAsync(["SubModule.xml"], "C:/staging", "a.zip");

    expect(installModuleAsync).toHaveBeenCalledWith(
      ["SubModule.xml"],
      "C:/staging",
      "a.zip",
      api,
      native,
    );
  });

  it.each([
    ["launcherex", ["*.bmlist"]],
    ["novus", ["*.xml"]],
  ] as const)(
    "offers only the %s module list files when importing or exporting one",
    async (format, extensions) => {
      const { manager, native } = create();

      expect(await manager.importModuleListAsync(format)).toBe(true);
      await manager.exportModuleListAsync(format);

      expect(
        vi
          .mocked(withFileDialogExtensionsAsync)
          .mock.calls.map(([requested]) => requested),
      ).toEqual([extensions, extensions]);
      expect(native.moduleListHandlerImportAsync).toHaveBeenCalledTimes(1);
      expect(native.moduleListHandlerExportAsync).toHaveBeenCalledTimes(1);
    },
  );

  it("tells the native manager the game's store in its own names", () => {
    const { manager, native } = create();

    manager.setStore("xbox");
    manager.setStore("gog");
    manager.setStore("somethingelse");

    expect(native.setGameStore.mock.calls).toEqual([
      ["Xbox"],
      ["GOG"],
      ["Unknown"],
    ]);
  });

  it("answers the save file's path for its name", async () => {
    const { manager, native } = create();

    expect(await manager.getSaveFilePathAsync("save1")).toBe("save1.sav");
    expect(native.getSaveFilePathAsync).toHaveBeenCalledWith("save1");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { selectors, types } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  NativeLauncherManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { installModuleAsync } from "./installer";
import { actionsLauncher } from "./actions";
import { bselectors } from "../selectors";
import {
  AVAILABLE_STORES,
  OBFUSCATED_BINARIES,
  STEAM_BINARIES_ON_XBOX,
  SUB_MODS_IDS,
} from "../common";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: { currentGameDiscovery: vi.fn() },
}));

vi.mock("@butr/vortexextensionnative", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@butr/vortexextensionnative")>()),
  BannerlordModuleManager: { getModuleInfoWithMetadata: vi.fn() },
}));

vi.mock("../selectors", () => ({
  bselectors: {
    useSteamBinariesOnXbox: vi.fn(() => false),
    bannerlordModById: vi.fn(),
  },
}));

vi.mock("../vortex/moduleAttributes", () => ({
  toStagedModulesInfo: (modules: { id: string }[]) => ({
    schema: 1,
    modules: modules.map((x) => x.id),
  }),
}));

vi.mock("../vortex/translationLanguages", () => ({
  getAvailableTranslationLanguages: async () => [],
  pushTranslationLanguageAttributes: () => undefined,
}));

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      // Fills {{ name }} like Vortex's translate, the dialog's text is checked below
      localize: (
        template: string,
        values: { replace?: Record<string, string> } = {},
      ) =>
        template.replace(
          /\{\{\s*(\w+)\s*\}\}/g,
          (_match, key: string) => values.replace?.[key] ?? "",
        ),
    }),
  },
}));

const STEAM_BIN = "bin/Win64_Shipping_Client";
const XBOX_BIN = "bin/Gaming.Desktop.x64_Shipping_Client";

const module = (id: string): vetypes.ModuleInfoExtendedWithMetadata =>
  ({
    id,
    name: `${id} name`,
  }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

const createApi = (
  dialogAction?: string,
): types.IExtensionApi & { dispatch: ReturnType<typeof vi.fn> } => {
  const dispatch = vi.fn();
  return {
    getState: () => ({}),
    showErrorNotification: vi.fn(),
    showDialog: vi.fn(async () => ({ action: dialogAction, input: {} })),
    store: { dispatch },
    dispatch,
  } as unknown as types.IExtensionApi & {
    dispatch: ReturnType<typeof vi.fn>;
  };
};

let destination: string;
let launcherManager: {
  installModule: ReturnType<typeof vi.fn>;
  isObfuscatedAsync: ReturnType<typeof vi.fn>;
};

const writeSubModule = async (id: string): Promise<string> => {
  const relativePath = path.join("Modules", id, "SubModule.xml");
  await mkdir(path.join(destination, "Modules", id), { recursive: true });
  await writeFile(path.join(destination, relativePath), id);
  return relativePath;
};

const setGameStore = (store: string): void => {
  vi.mocked(selectors.currentGameDiscovery).mockReturnValue({
    store,
  } as types.IDiscoveryResult);
};

const instruction = (
  type: vetypes.InstructionType,
  options: Partial<vetypes.InstallInstruction> = {},
): vetypes.InstallInstruction => ({ type, ...options });

const storeBinaries = (
  store: vetypes.GameStore,
  folder: string,
): vetypes.InstallInstruction =>
  instruction("CopyStore", {
    store,
    source: path.join(destination, "Modules", "A", folder, "A.dll"),
    destination: `Modules/A/${folder}/A.dll`,
  });

const install = (
  api: types.IExtensionApi,
  files: string[],
  instructions: vetypes.InstallInstruction[],
): Promise<types.IInstallResult> => {
  launcherManager.installModule.mockReturnValue({ instructions });
  return installModuleAsync(
    files,
    destination,
    undefined,
    api,
    launcherManager as unknown as NativeLauncherManager,
  );
};

const attribute = (result: types.IInstallResult, key: string): unknown =>
  result.instructions.find((x) => x.type === "attribute" && x.key === key)
    ?.value;

const copies = (result: types.IInstallResult): types.IInstruction[] =>
  result.instructions.filter((x) => x.type === "copy");

beforeEach(async () => {
  vi.clearAllMocks();
  destination = await mkdtemp(path.join(os.tmpdir(), "bannerlord-install-"));
  launcherManager = {
    installModule: vi.fn(),
    isObfuscatedAsync: vi.fn(async () => false),
  };
  vi.mocked(
    BannerlordModuleManager.getModuleInfoWithMetadata,
  ).mockImplementation((content: string) => module(content));
  vi.mocked(bselectors.useSteamBinariesOnXbox).mockReturnValue(false);
  setGameStore("steam");
});

afterEach(async () => {
  await rm(destination, { recursive: true, force: true });
});

describe("installModuleAsync", () => {
  it("installs nothing from an archive without SubModule.xml", async () => {
    const api = createApi();

    const result = await install(api, ["readme.txt"], []);

    expect(result).toEqual({ instructions: [] });
    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
    expect(launcherManager.installModule).not.toHaveBeenCalled();
  });

  it("installs nothing when a SubModule.xml can't be parsed", async () => {
    const api = createApi();
    const subModule = await writeSubModule("A");
    vi.mocked(
      BannerlordModuleManager.getModuleInfoWithMetadata,
    ).mockReturnValue(
      undefined as unknown as vetypes.ModuleInfoExtendedWithMetadata,
    );

    const result = await install(api, [subModule], []);

    expect(result).toEqual({ instructions: [] });
    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
  });

  it("passes every module of a multi-module archive to the launcher", async () => {
    const files = [await writeSubModule("A"), await writeSubModule("B")];

    await install(createApi(), files, []);

    const [fullPaths, moduleInfos] = launcherManager.installModule.mock
      .calls[0]! as [string[], vetypes.ModuleInfoExtendedWithMetadata[]];
    expect(fullPaths).toEqual(files.map((x) => path.join(destination, x)));
    expect(moduleInfos.map((x) => x.id)).toEqual(["A", "B"]);
  });

  it("copies the files and only the binaries of the game's store", async () => {
    const subModule = await writeSubModule("A");

    const result = await install(
      createApi(),
      [subModule],
      [
        instruction("Copy", {
          source: path.join(destination, subModule),
          destination: "Modules/A/SubModule.xml",
        }),
        storeBinaries("Steam", STEAM_BIN),
        storeBinaries("Xbox", XBOX_BIN),
      ],
    );

    expect(copies(result).map((x) => x.destination)).toEqual([
      "Modules/A/SubModule.xml",
      `Modules/A/${STEAM_BIN}/A.dll`,
    ]);
    expect(copies(result)[0]?.source).not.toContain(destination);
    expect(copies(result)[0]?.source?.endsWith(subModule)).toBe(true);
    expect(attribute(result, AVAILABLE_STORES)).toEqual(["Steam", "Xbox"]);
    expect(attribute(result, STEAM_BINARIES_ON_XBOX)).toBe(false);
  });

  it("lists each module once in the mod's attributes", async () => {
    const subModule = await writeSubModule("A");

    const result = await install(
      createApi(),
      [subModule],
      [
        instruction("ModuleInfo", { moduleInfo: module("A") }),
        instruction("ModuleInfo", { moduleInfo: module("A") }),
        instruction("ModuleInfo", { moduleInfo: module("B") }),
      ],
    );

    expect(attribute(result, SUB_MODS_IDS)).toEqual(["A", "B"]);
  });

  it("marks the mod obfuscated when any module is", async () => {
    const files = [await writeSubModule("A"), await writeSubModule("B")];
    launcherManager.isObfuscatedAsync.mockImplementation(
      async (x: vetypes.ModuleInfoExtended) => x.id === "B",
    );

    const result = await install(createApi(), files, []);

    expect(attribute(result, OBFUSCATED_BINARIES)).toBe(true);
  });

  describe("on Game Pass PC (Xbox)", () => {
    beforeEach(() => {
      setGameStore("xbox");
    });

    it("installs the mod's Xbox binaries without asking", async () => {
      const api = createApi();
      const subModule = await writeSubModule("A");

      const result = await install(
        api,
        [subModule],
        [storeBinaries("Steam", STEAM_BIN), storeBinaries("Xbox", XBOX_BIN)],
      );

      expect(api.showDialog).not.toHaveBeenCalled();
      expect(copies(result).map((x) => x.destination)).toEqual([
        `Modules/A/${XBOX_BIN}/A.dll`,
      ]);
      expect(attribute(result, STEAM_BINARIES_ON_XBOX)).toBe(false);
    });

    it("with Steam binaries allowed for the session, installs them into the Xbox folder without asking", async () => {
      vi.mocked(bselectors.useSteamBinariesOnXbox).mockReturnValue(true);
      const api = createApi();
      const subModule = await writeSubModule("A");

      const result = await install(
        api,
        [subModule],
        [storeBinaries("Steam", STEAM_BIN)],
      );

      expect(api.showDialog).not.toHaveBeenCalled();
      expect(copies(result).map((x) => x.destination)).toEqual([
        `Modules/A/${XBOX_BIN}/A.dll`,
      ]);
      expect(attribute(result, STEAM_BINARIES_ON_XBOX)).toBe(true);
      expect(attribute(result, AVAILABLE_STORES)).toEqual(["Steam", "Xbox"]);
    });

    it("installs no binaries when the user declines the Steam ones", async () => {
      const api = createApi("No, remove the mods");
      const subModule = await writeSubModule("A");

      const result = await install(
        api,
        [subModule],
        [storeBinaries("Steam", STEAM_BIN)],
      );

      expect(api.showDialog).toHaveBeenCalledTimes(1);
      expect(copies(result)).toEqual([]);
      expect(attribute(result, STEAM_BINARIES_ON_XBOX)).toBe(false);
      expect(attribute(result, AVAILABLE_STORES)).toEqual(["Steam"]);
    });

    it("installs the Steam binaries once when the user accepts", async () => {
      const api = createApi("Install, I accept the risks");
      const subModule = await writeSubModule("A");

      const result = await install(
        api,
        [subModule],
        [storeBinaries("Steam", STEAM_BIN)],
      );

      expect(copies(result).map((x) => x.destination)).toEqual([
        `Modules/A/${XBOX_BIN}/A.dll`,
      ]);
      expect(attribute(result, STEAM_BINARIES_ON_XBOX)).toBe(true);
      expect(api.dispatch).not.toHaveBeenCalled();
    });

    it("names the mod being installed after its archive, or lists its modules", async () => {
      const api = createApi("No, remove the mods");
      const subModule = await writeSubModule("A");
      vi.mocked(bselectors.bannerlordModById).mockImplementation(
        (_state, modId) =>
          modId === "MyMod-1-2-0"
            ? ({ attributes: { modName: "My Mod" } } as never)
            : undefined,
      );
      launcherManager.installModule.mockReturnValue({
        instructions: [
          storeBinaries("Steam", STEAM_BIN),
          instruction("ModuleInfo", { moduleInfo: module("A") }),
        ],
      });
      const message = (): string =>
        (vi.mocked(api.showDialog!).mock.lastCall![2] as { message: string })
          .message;

      await installModuleAsync(
        [subModule],
        destination,
        path.join("C:", "downloads", "MyMod-1-2-0.zip"),
        api,
        launcherManager as unknown as NativeLauncherManager,
      );
      expect(message()).toContain("My Mod");

      await installModuleAsync(
        [subModule],
        destination,
        path.join("C:", "downloads", "Unknown-9.zip"),
        api,
        launcherManager as unknown as NativeLauncherManager,
      );
      expect(message()).toContain("* A name (A)");
    });

    it("remembers the choice for the session when the user accepts for all", async () => {
      const api = createApi(
        "Install, I accept the risks. Don't ask again for the current session",
      );
      const subModule = await writeSubModule("A");

      const result = await install(
        api,
        [subModule],
        [storeBinaries("Steam", STEAM_BIN)],
      );

      expect(attribute(result, STEAM_BINARIES_ON_XBOX)).toBe(true);
      expect(api.dispatch).toHaveBeenCalledWith(
        actionsLauncher.setUseSteamBinariesOnXbox(true),
      );
    });
  });
});

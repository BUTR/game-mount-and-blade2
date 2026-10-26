import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectors, types, util } from "@nexusmods/vortex-api";
import type { IVerifyBuildResult } from "@bannerlord/store-builds/verifyBuild";
import { verifyBuildInWorkerAsync } from "@bannerlord/store-builds/verifyBuild";
import { getXboxRelatedPackageRoots } from "@bannerlord/store-builds/storePaths";
import { readXboxProductIdAsync } from "@bannerlord/store-builds/xbox";
import { getBuildVersionAsync, getInstalledVersion } from "./buildVersions";
import {
  deleteFilesAsync,
  getFolder,
  getPackageFolder,
  getStoreName,
  getVerifyStore,
  isDeletable,
  removeEmptyFoldersAsync,
  showModInModsPage,
  verifyFilesAsync,
} from "./verify";
import { IVerifyFile, VerifyFileSource, VerifyFileStatus } from "./types";

const GAME_ID = vi.hoisted(() => "mountandblade2bannerlord");

const launcher = vi.hoisted(() => ({
  modules: {} as Record<string, unknown>,
}));

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: {
    discoveryByGame: vi.fn(),
    modPathsForGame: vi.fn(),
  },
  util: {
    getManifest: vi.fn(),
    renderModName: (mod: { attributes?: { name?: string }; id: string }) =>
      mod.attributes?.name ?? mod.id,
    getVortexPath: () => "",
    sanitizeCSSId: (id: string) => `css-${id}`,
  },
  types: {},
}));
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("@bannerlord/core/selectors", () => ({
  bselectors: {
    bannerlordMods: (state: {
      persistent: { mods: Record<string, Record<string, unknown>> };
    }) => state.persistent.mods[GAME_ID] ?? {},
  },
}));
vi.mock("@bannerlord/core/launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({
      getAllModulesAsync: () => Promise.resolve(launcher.modules),
    }),
  },
}));
vi.mock("@bannerlord/store-builds/verifyBuild", () => ({
  verifyBuildInWorkerAsync: vi.fn(),
}));
vi.mock("@bannerlord/store-builds/storePaths", () => ({
  getSteamPaths: () => ["C:\\Steam"],
  getEpicDataPath: () => "C:\\EpicData",
  getXboxRelatedPackageRoots: vi.fn(() => ["C:\\XboxGames\\Dlc\\Content"]),
}));
vi.mock("@bannerlord/store-builds/xbox", () => ({
  readXboxProductIdAsync: vi.fn(() => Promise.resolve("9PDHWZ7X3P03")),
}));
vi.mock("./buildVersions", () => ({
  getBuildVersionAsync: vi.fn(() => Promise.resolve(undefined)),
  getInstalledVersion: vi.fn(() => undefined),
}));

const verifyFile = (
  status: VerifyFileStatus,
  source: VerifyFileSource,
  extra: Partial<IVerifyFile> = {},
): IVerifyFile => ({
  path: "Modules/MyMod/a.dll",
  folder: "Modules/MyMod",
  status,
  source,
  ...extra,
});

describe("getFolder", () => {
  it("lists a module's files under the module's folder", () => {
    expect(getFolder("Modules/MyMod/bin/Win64_Shipping_Client/MyMod.dll")).toBe(
      "Modules/MyMod",
    );
    expect(getFolder("modules/MyMod/SubModule.xml")).toBe("modules/MyMod");
  });

  it("lists other files under the folder they're in", () => {
    expect(getFolder("bin/Win64_Shipping_Client/Bannerlord.exe")).toBe(
      "bin/Win64_Shipping_Client",
    );
    expect(getFolder("Modules/readme.txt")).toBe("Modules");
    expect(getFolder("readme.txt")).toBe("");
  });
});

describe("getPackageFolder", () => {
  const dlc = { name: "War Sails", path: "C:\\XboxGames\\Dlc\\Content" };

  it("puts the package's name before the folder", () => {
    expect(getPackageFolder(dlc, "Modules/NavalDLC/SubModule.xml")).toBe(
      "War Sails › Modules/NavalDLC",
    );
  });

  it("is the package's name for a file at its root", () => {
    expect(getPackageFolder(dlc, "appxmanifest.xml")).toBe("War Sails");
  });
});

describe("getStoreName", () => {
  it("names each store", () => {
    expect(
      (["steam", "gog", "epic", "xbox"] as const).map(getStoreName),
    ).toEqual(["Steam", "GOG", "Epic", "Xbox"]);
  });
});

describe("getVerifyStore", () => {
  it("is the store of the game's discovery when its builds can be verified", () => {
    for (const store of ["steam", "gog", "epic", "xbox"]) {
      vi.mocked(selectors.discoveryByGame).mockReturnValueOnce({ store });

      expect(getVerifyStore({} as types.IState)).toBe(store);
    }
  });

  it("is undefined for other stores or an undiscovered game", () => {
    vi.mocked(selectors.discoveryByGame).mockReturnValueOnce({
      store: "origin",
    });
    expect(getVerifyStore({} as types.IState)).toBe(undefined);

    vi.mocked(selectors.discoveryByGame).mockReturnValueOnce({});
    expect(getVerifyStore({} as types.IState)).toBe(undefined);

    vi.mocked(selectors.discoveryByGame).mockReturnValueOnce(undefined);
    expect(getVerifyStore({} as types.IState)).toBe(undefined);
  });
});

describe("isDeletable", () => {
  it("allows extra files of the game folder that nothing manages", () => {
    expect(isDeletable(verifyFile("extra", "unknown"))).toBe(true);
    expect(isDeletable(verifyFile("extra", "manualMod"))).toBe(true);
    expect(isDeletable(verifyFile("extra", "game"))).toBe(true);
  });

  it("keeps files Vortex or the store manage", () => {
    expect(isDeletable(verifyFile("extra", "vortex"))).toBe(false);
    expect(isDeletable(verifyFile("extra", "vortexInternal"))).toBe(false);
    expect(isDeletable(verifyFile("extra", "store"))).toBe(false);
  });

  it("keeps files of the build and of other packages", () => {
    expect(isDeletable(verifyFile("changed", "unknown"))).toBe(false);
    expect(isDeletable(verifyFile("missing", "unknown"))).toBe(false);
    expect(
      isDeletable(
        verifyFile("extra", "unknown", {
          package: { name: "War Sails", path: "C:\\Dlc" },
        }),
      ),
    ).toBe(false);
  });
});

describe("deleting files", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "verify-files-delete-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeFileAsync = async (filePath: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, filePath)), {
      recursive: true,
    });
    await fs.writeFile(path.join(root, filePath), "x");
  };

  const existsAsync = (filePath: string): Promise<boolean> =>
    fs.access(path.join(root, filePath)).then(
      () => true,
      () => false,
    );

  describe("deleteFilesAsync", () => {
    it("deletes the deletable files and the folders they leave empty", async () => {
      await writeFileAsync("Modules/Hand/bin/Hand.dll");
      await writeFileAsync("Modules/Hand/SubModule.xml");
      await writeFileAsync("Modules/Native/SubModule.xml");
      await writeFileAsync("Modules/Native/extra.txt");
      await writeFileAsync("vortex.deployment.json");

      await deleteFilesAsync(root, [
        verifyFile("extra", "manualMod", { path: "Modules/Hand/bin/Hand.dll" }),
        verifyFile("extra", "manualMod", {
          path: "Modules/Hand/SubModule.xml",
        }),
        verifyFile("extra", "unknown", { path: "Modules/Native/extra.txt" }),
        verifyFile("extra", "vortexInternal", {
          path: "vortex.deployment.json",
        }),
        verifyFile("extra", "unknown", { path: "already-gone.txt" }),
      ]);

      expect(await existsAsync("Modules/Hand")).toBe(false);
      expect(await existsAsync("Modules/Native/extra.txt")).toBe(false);
      expect(await existsAsync("Modules/Native/SubModule.xml")).toBe(true);
      expect(await existsAsync("vortex.deployment.json")).toBe(true);
    });

    it("refuses a path outside of the game folder", async () => {
      await expect(
        deleteFilesAsync(root, [
          verifyFile("extra", "unknown", { path: "../outside.txt" }),
        ]),
      ).rejects.toThrow("outside of the game folder");
    });

    it.skipIf(process.platform !== "win32")(
      "refuses an absolute path on another drive",
      async () => {
        // path.relative answers an absolute path for it, not one starting with ".."
        const drive = path.parse(root).root.toUpperCase().startsWith("C:")
          ? "D:\\"
          : "C:\\";

        await expect(
          deleteFilesAsync(root, [
            verifyFile("extra", "unknown", { path: `${drive}outside.txt` }),
          ]),
        ).rejects.toThrow("outside of the game folder");
      },
    );

    it("refuses the game folder itself", async () => {
      await expect(
        deleteFilesAsync(root, [verifyFile("extra", "unknown", { path: "." })]),
      ).rejects.toThrow("outside of the game folder");
    });
  });

  describe("removeEmptyFoldersAsync", () => {
    it("removes empty folders up to the first one with something left, never the game folder", async () => {
      await fs.mkdir(path.join(root, "a", "b", "c"), { recursive: true });
      await writeFileAsync("a/keep.txt");
      await fs.mkdir(path.join(root, "d", "e"), { recursive: true });

      await removeEmptyFoldersAsync(root, [
        path.join(root, "a", "b", "c"),
        path.join(root, "d", "e"),
      ]);

      expect(await existsAsync("a/b")).toBe(false);
      expect(await existsAsync("a/keep.txt")).toBe(true);
      expect(await existsAsync("d")).toBe(false);
      expect(await fs.readdir(root)).toEqual(["a"]);
    });

    it("removes nested empty folders whichever order they're given in", async () => {
      await fs.mkdir(path.join(root, "a", "b"), { recursive: true });
      await writeFileAsync("keep.txt");

      await removeEmptyFoldersAsync(root, [
        path.join(root, "a"),
        path.join(root, "a", "b"),
      ]);

      expect(await fs.readdir(root)).toEqual(["keep.txt"]);
    });

    it("leaves folders outside of the game folder", async () => {
      const outside = await fs.mkdtemp(
        path.join(os.tmpdir(), "verify-files-outside-"),
      );
      try {
        await removeEmptyFoldersAsync(root, [outside]);

        await expect(fs.access(outside)).resolves.toBe(undefined);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });

    it("leaves an empty sibling folder whose name starts with the game folder's", async () => {
      // 'D:/Games/Bannerlord2/x' starts with 'D:/Games/Bannerlord' as a string
      const sibling = `${root}2`;
      await fs.mkdir(path.join(sibling, "x"), { recursive: true });
      try {
        await removeEmptyFoldersAsync(root, [path.join(sibling, "x")]);

        await expect(fs.access(path.join(sibling, "x"))).resolves.toBe(
          undefined,
        );
      } finally {
        await fs.rm(sibling, { recursive: true, force: true });
      }
    });

    it("works with a game folder given with a trailing separator", async () => {
      await fs.mkdir(path.join(root, "a", "b"), { recursive: true });

      await removeEmptyFoldersAsync(root + path.sep, [
        path.join(root + path.sep, "a", "b"),
      ]);

      expect(await fs.readdir(root)).toEqual([]);
    });
  });
});

describe("showModInModsPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the Mods page, and scrolls to the mod and highlights it once the page may be mounted", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const highlightControl = vi.fn();
    const api = {
      events: { emit },
      highlightControl,
    } as unknown as types.IExtensionApi;

    showModInModsPage(api, "harmony-1");

    expect(emit.mock.calls).toEqual([["show-main-page", "Mods"]]);
    expect(highlightControl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith("mods-scroll-to", "harmony-1");
    expect(highlightControl).toHaveBeenCalledWith(".css-harmony-1", 4000);
  });
});

describe("verifyFilesAsync", () => {
  const gamePath = path.resolve(os.tmpdir(), "Bannerlord");

  const api = (mods: Record<string, unknown> = {}): types.IExtensionApi =>
    ({
      getState: () => ({ persistent: { mods: { [GAME_ID]: mods } } }),
    }) as unknown as types.IExtensionApi;

  const build = (
    overrides: Partial<IVerifyBuildResult> = {},
  ): IVerifyBuildResult => ({
    buildId: "19012345",
    productId: "261550",
    missingLists: [],
    sizesKnown: true,
    contentsChecked: false,
    packages: [],
    comparison: {
      expectedFileCount: 100,
      extra: [],
      changed: [],
      missing: [],
    },
    ...overrides,
  });

  const extra = (filePath: string, size = 1) => ({
    path: filePath,
    size,
    isLink: false,
  });

  const setUp = (
    store: string,
    result: IVerifyBuildResult,
    deployment: {
      modPaths?: Record<string, string>;
      files?: Record<
        string,
        { relPath: string; source: string; target?: string }[]
      >;
    } = {},
  ): void => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue({
      path: gamePath,
      store,
    });
    vi.mocked(selectors.modPathsForGame).mockReturnValue(
      deployment.modPaths ?? { "": gamePath },
    );
    vi.mocked(util.getManifest).mockImplementation((_api, modType) =>
      Promise.resolve({
        files: deployment.files?.[modType ?? ""] ?? [],
      } as unknown as Awaited<ReturnType<typeof util.getManifest>>),
    );
    vi.mocked(verifyBuildInWorkerAsync).mockResolvedValue(result);
  };

  const sourcesOf = (files: IVerifyFile[]): Record<string, VerifyFileSource> =>
    Object.fromEntries(files.map((file) => [file.path, file.source]));

  afterEach(() => {
    // Implementations too, a test's mockReturnValue would otherwise reach the next test
    vi.resetAllMocks();
    launcher.modules = {};
  });

  it("throws for a store whose builds can't be verified", async () => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue({
      path: gamePath,
      store: "origin",
    });

    await expect(verifyFilesAsync(api())).rejects.toThrow(
      "Only the Steam, GOG, Epic and Xbox versions of the game can be verified",
    );
  });

  it("reports the build without files when its lists are missing", async () => {
    const { comparison: _, ...withoutComparison } = build({
      missingLists: ["261551"],
    });
    setUp("steam", withoutComparison);

    const report = await verifyFilesAsync(api());

    expect(report).toEqual({
      store: "steam",
      buildId: "19012345",
      storeUrl: "steam://validate/261550",
      expectedFileCount: 0,
      sizesKnown: true,
      contentsChecked: false,
      missingLists: ["261551"],
      files: [],
    });
  });

  it("passes the store's paths to the worker, only the ones of the game's store", async () => {
    setUp("steam", build());
    await verifyFilesAsync(api());

    expect(verifyBuildInWorkerAsync).toHaveBeenLastCalledWith({
      store: "steam",
      gamePath,
      steamPaths: ["C:\\Steam"],
      epicDataPath: undefined,
      xboxPackageRoots: [],
    });

    setUp("xbox", build());
    await verifyFilesAsync(api());

    expect(readXboxProductIdAsync).toHaveBeenCalledWith(gamePath);
    expect(getXboxRelatedPackageRoots).toHaveBeenCalledWith("9PDHWZ7X3P03");
    expect(verifyBuildInWorkerAsync).toHaveBeenLastCalledWith({
      store: "xbox",
      gamePath,
      steamPaths: [],
      epicDataPath: undefined,
      xboxPackageRoots: ["C:\\XboxGames\\Dlc\\Content"],
    });
  });

  it("takes the store's version first, then the registry's, then the game files'", async () => {
    setUp("epic", build({ version: "v1.2.3.4" }));
    vi.mocked(getBuildVersionAsync).mockResolvedValue("v9.9.9.9");
    vi.mocked(getInstalledVersion).mockReturnValue("v8.8.8.8");

    expect((await verifyFilesAsync(api())).version).toBe("v1.2.3.4");

    setUp("steam", build());
    expect((await verifyFilesAsync(api())).version).toBe("v9.9.9.9");
    expect(getBuildVersionAsync).toHaveBeenLastCalledWith("steam", "19012345");

    vi.mocked(getBuildVersionAsync).mockResolvedValue(undefined);
    expect((await verifyFilesAsync(api())).version).toBe("v8.8.8.8");

    vi.mocked(getInstalledVersion).mockReturnValue(undefined);
    expect(await verifyFilesAsync(api())).not.toHaveProperty("version");
  });

  it("links to the store's page of the game", async () => {
    const urlOf = async (store: string, productId: string): Promise<string> => {
      setUp(store, build({ productId }));
      return (await verifyFilesAsync(api())).storeUrl;
    };

    expect(await urlOf("gog", "1802539526")).toBe(
      "goggalaxy://openGameView/1802539526",
    );
    expect(await urlOf("epic", "ns:item:Chickadee")).toBe(
      "com.epicgames.launcher://apps/ns%3Aitem%3AChickadee?action=verify",
    );
    expect(await urlOf("epic", "")).toBe("com.epicgames.launcher://");
    expect(await urlOf("xbox", "9PDHWZ7X3P03")).toBe(
      "msxbox://game/?productId=9PDHWZ7X3P03",
    );
  });

  it("tells which mod Vortex deployed each file from", async () => {
    setUp(
      "steam",
      build({
        comparison: {
          expectedFileCount: 10,
          extra: [
            extra("Modules/Bannerlord.Harmony/SubModule.xml", 50),
            extra("Modules/Removed/SubModule.xml"),
            extra("bin/Win64_Shipping_Client/Bannerlord.BLSE.Shared.dll"),
          ],
          // A mod's file over one of the game's
          changed: [
            {
              path: "bin/Win64_Shipping_Client/TaleWorlds.Library.dll",
              size: 5,
              expectedSize: 4,
            },
          ],
          missing: [],
        },
      }),
      {
        modPaths: {
          "": gamePath,
          "bannerlord-blse": path.join(gamePath, "bin"),
          other: path.resolve(gamePath, "..", "Elsewhere"),
          none: "",
        },
        files: {
          "": [
            {
              relPath: "Bannerlord.Harmony\\SubModule.xml",
              source: "harmony-1",
              target: "Modules",
            },
            { relPath: "Modules\\Removed\\SubModule.xml", source: "removed-1" },
          ],
          "bannerlord-blse": [
            {
              relPath: "Win64_Shipping_Client\\Bannerlord.BLSE.Shared.dll",
              source: "blse-1",
            },
            {
              relPath: "Win64_Shipping_Client\\TaleWorlds.Library.dll",
              source: "blse-1",
            },
          ],
          other: [{ relPath: "SubModule.xml", source: "harmony-1" }],
        },
      },
    );

    const report = await verifyFilesAsync(
      api({
        "harmony-1": { id: "harmony-1", attributes: { name: "Harmony" } },
        "blse-1": { id: "blse-1" },
      }),
    );

    expect(report.files).toEqual([
      {
        path: "Modules/Bannerlord.Harmony/SubModule.xml",
        folder: "Modules/Bannerlord.Harmony",
        status: "extra",
        source: "vortex",
        modId: "harmony-1",
        modName: "Harmony",
        size: 50,
      },
      {
        path: "Modules/Removed/SubModule.xml",
        folder: "Modules/Removed",
        status: "extra",
        source: "vortex",
        modName: "removed-1",
        size: 1,
      },
      {
        path: "bin/Win64_Shipping_Client/Bannerlord.BLSE.Shared.dll",
        folder: "bin/Win64_Shipping_Client",
        status: "extra",
        source: "vortex",
        modId: "blse-1",
        modName: "blse-1",
        size: 1,
      },
      {
        path: "bin/Win64_Shipping_Client/TaleWorlds.Library.dll",
        folder: "bin/Win64_Shipping_Client",
        status: "changed",
        source: "vortex",
        modId: "blse-1",
        modName: "blse-1",
        size: 5,
        expectedSize: 4,
      },
    ]);
    expect(util.getManifest).not.toHaveBeenCalledWith(
      expect.anything(),
      "none",
      GAME_ID,
    );
  });

  it("tells Vortex's own files, the game's and unknown ones apart", async () => {
    setUp(
      "steam",
      build({
        comparison: {
          expectedFileCount: 10,
          extra: [
            extra("vortex.deployment.json"),
            extra("Modules/vortex.deployment.bannerlord-blse.json"),
            extra(
              "bin/Win64_Shipping_Client/TaleWorlds.Library.dll.vortex_backup",
            ),
            extra("Modules/__folder_managed_by_vortex"),
            extra("Modules/Multiplayer/SceneObj/mp_custom/scene.xscene"),
            extra("bin/Win64_Shipping_Client/imgui.ini"),
            extra("bin/Win64_Shipping_Client/sub/imgui.ini"),
            extra("Modules/MyMod/ShaderCache/shader.bin"),
            extra("unins000.exe"),
            extra("random.dll"),
          ],
          changed: [
            {
              path: "Modules/Native/ShaderCache/shader.bin",
              size: 5,
              expectedSize: 4,
            },
          ],
          missing: [
            { path: "bin/Win64_Shipping_Client/Bannerlord.exe", size: 10 },
          ],
        },
      }),
    );

    const report = await verifyFilesAsync(api());

    expect(sourcesOf(report.files)).toEqual({
      "vortex.deployment.json": "vortexInternal",
      "Modules/vortex.deployment.bannerlord-blse.json": "vortexInternal",
      "bin/Win64_Shipping_Client/TaleWorlds.Library.dll.vortex_backup":
        "vortexInternal",
      "Modules/__folder_managed_by_vortex": "vortexInternal",
      "Modules/Multiplayer/SceneObj/mp_custom/scene.xscene": "game",
      "bin/Win64_Shipping_Client/imgui.ini": "game",
      "bin/Win64_Shipping_Client/sub/imgui.ini": "unknown",
      // A mod's shader cache isn't the game's
      "Modules/MyMod/ShaderCache/shader.bin": "unknown",
      // GOG's file, but this is Steam's build
      "unins000.exe": "unknown",
      "random.dll": "unknown",
      "Modules/Native/ShaderCache/shader.bin": "game",
      "bin/Win64_Shipping_Client/Bannerlord.exe": "unknown",
    });
    expect(
      report.files.find((file) => file.status === "changed"),
    ).toMatchObject({ size: 5, expectedSize: 4 });
    expect(
      report.files.find((file) => file.status === "missing"),
    ).toMatchObject({ size: 10 });
  });

  it.each([
    [
      "gog",
      [
        "goggame-1802539526.info",
        "unins000.dat",
        "unins001.exe",
        "Mount & Blade II Bannerlord.lnk",
        "gog.ico",
        "support.ico",
        "goglog.ini",
      ],
      ["bin/goggame-1.info", "unins.exe"],
    ],
    ["epic", [".egstore/ABC.manifest", "$movedMarker"], ["bin/.egstore/x"]],
    ["xbox", ["gamelaunchhelper.exe"], ["bin/gamelaunchhelper.exe"]],
  ])(
    "tells the %s store's own files from others",
    async (store, storeFiles, otherFiles) => {
      setUp(
        store,
        build({
          comparison: {
            expectedFileCount: 1,
            extra: [...storeFiles, ...otherFiles].map((file) => extra(file)),
            changed: [],
            missing: [],
          },
        }),
      );

      const report = await verifyFilesAsync(api());

      expect(sourcesOf(report.files)).toEqual({
        ...Object.fromEntries(storeFiles.map((file) => [file, "store"])),
        ...Object.fromEntries(otherFiles.map((file) => [file, "unknown"])),
      });
    },
  );

  it("tells the extra files of modules copied in by hand, even of a module Vortex has files in", async () => {
    launcher.modules = {
      Hand: {
        id: "Hand",
        name: "Hand Mod",
        isOfficial: false,
        path: path.join(gamePath, "Modules", "Hand", "SubModule.xml"),
      },
      Unnamed: {
        id: "Unnamed",
        name: "",
        isOfficial: false,
        path: path.join(gamePath, "Modules", "Unnamed", "SubModule.xml"),
      },
      Native: {
        id: "Native",
        name: "Native",
        isOfficial: true,
        path: path.join(gamePath, "Modules", "Native", "SubModule.xml"),
      },
      Workshop: {
        id: "Workshop",
        name: "Workshop Mod",
        isOfficial: false,
        path: path.join(
          gamePath,
          "..",
          "workshop",
          "Workshop",
          "SubModule.xml",
        ),
      },
    };
    setUp(
      "steam",
      build({
        comparison: {
          expectedFileCount: 1,
          extra: [
            extra("Modules/Hand/SubModule.xml"),
            extra("Modules/hand/bin/Hand.dll"),
            extra("Modules/Hand/vortex.deployment.json"),
            extra("Modules/Unnamed/a.xml"),
            extra("Modules/Native/extra.txt"),
            extra("Modules/Hand/deployed.xml"),
          ],
          changed: [],
          missing: [{ path: "Modules/Hand/gone.xml", size: 1 }],
        },
      }),
      {
        files: {
          "": [{ relPath: "Modules\\Hand\\deployed.xml", source: "hand-1" }],
        },
      },
    );

    const report = await verifyFilesAsync(api());

    expect(
      report.files.map(({ path: filePath, source, modName }) => ({
        path: filePath,
        source,
        modName,
      })),
    ).toEqual([
      {
        path: "Modules/Hand/SubModule.xml",
        source: "manualMod",
        modName: "Hand Mod",
      },
      {
        path: "Modules/hand/bin/Hand.dll",
        source: "manualMod",
        modName: "Hand Mod",
      },
      {
        path: "Modules/Hand/vortex.deployment.json",
        source: "vortexInternal",
        modName: undefined,
      },
      {
        path: "Modules/Unnamed/a.xml",
        source: "manualMod",
        modName: "Unnamed",
      },
      {
        path: "Modules/Native/extra.txt",
        source: "unknown",
        modName: undefined,
      },
      {
        path: "Modules/Hand/deployed.xml",
        source: "vortex",
        modName: "hand-1",
      },
      { path: "Modules/Hand/gone.xml", source: "unknown", modName: undefined },
    ]);
  });

  it("lists the files of other packages under the package, counting their files", async () => {
    const dlc = {
      name: "War Sails",
      path: "C:\\XboxGames\\Dlc\\Content",
      expectedFileCount: 20,
      changed: [
        {
          path: "Modules/NavalDLC/ShaderCache/a.bin",
          size: 3,
          expectedSize: 3,
        },
      ],
      missing: [{ path: "Modules/NavalDLC/SubModule.xml", size: 7 }],
    };
    setUp("xbox", build({ packages: [dlc], contentsChecked: true }), {
      files: {
        "": [{ relPath: "Modules\\NavalDLC\\SubModule.xml", source: "x" }],
      },
    });

    const report = await verifyFilesAsync(api());

    expect(report.expectedFileCount).toBe(120);
    expect(report.contentsChecked).toBe(true);
    expect(report.files).toEqual([
      {
        path: "Modules/NavalDLC/ShaderCache/a.bin",
        folder: "War Sails › Modules/NavalDLC",
        status: "changed",
        source: "game",
        size: 3,
        expectedSize: 3,
        package: { name: "War Sails", path: "C:\\XboxGames\\Dlc\\Content" },
      },
      {
        path: "Modules/NavalDLC/SubModule.xml",
        folder: "War Sails › Modules/NavalDLC",
        // Vortex deployed into the game folder, not the package's
        status: "missing",
        source: "unknown",
        size: 7,
        package: { name: "War Sails", path: "C:\\XboxGames\\Dlc\\Content" },
      },
    ]);
  });
});

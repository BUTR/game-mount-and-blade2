import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { FetchBannerlordVersion } from "@butr/vortexextensionnative";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  BannerlordGame,
  getBannerlordMainExe,
  getBannerlordToolExe,
} from "./game";
import { findGameAsync, setupAsync } from "./utils";
import { GAME_ID } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    discoveryByGame: (
      state: { discovered: Record<string, unknown> },
      gameId: string,
    ) => state.discovered[gameId],
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({
  FetchBannerlordVersion: { getVersion: vi.fn(() => "v1.2.3.0") },
}));
vi.mock("./utils", () => ({
  findGameAsync: vi.fn(),
  setupAsync: vi.fn(() => Promise.resolve()),
}));

const STANDARD_EXE = path.join(
  "bin",
  "Win64_Shipping_Client",
  "Bannerlord.exe",
);
const XBOX_EXE = path.join(
  "bin",
  "Gaming.Desktop.x64_Shipping_Client",
  "Launcher.Native.exe",
);

const apiWith = (discovery?: { path?: string; store?: string }) =>
  ({
    getState: () => ({
      discovered: discovery !== undefined ? { [GAME_ID]: discovery } : {},
    }),
  }) as unknown as types.IExtensionApi;

describe("getBannerlordMainExe", () => {
  let root: string;
  let steamFolder: string;
  let xboxFolder: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bannerlord-game-"));
    steamFolder = path.join(root, "Steam");
    xboxFolder = path.join(root, "Xbox");
    await mkdir(path.join(steamFolder, "bin", "Win64_Shipping_Client"), {
      recursive: true,
    });
    await writeFile(path.join(steamFolder, STANDARD_EXE), "");
    await mkdir(path.dirname(path.join(xboxFolder, XBOX_EXE)), {
      recursive: true,
    });
    await writeFile(path.join(xboxFolder, XBOX_EXE), "");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("is empty before the game is discovered", () => {
    expect(getBannerlordMainExe(steamFolder, apiWith())).toBe("");
  });

  it("follows the discovered store", () => {
    expect(
      getBannerlordMainExe(
        xboxFolder,
        apiWith({ path: xboxFolder, store: "xbox" }),
      ),
    ).toBe(XBOX_EXE);
    for (const store of ["steam", "gog", "epic"]) {
      expect(
        getBannerlordMainExe(
          steamFolder,
          apiWith({ path: steamFolder, store }),
        ),
      ).toBe(STANDARD_EXE);
    }
  });

  it("checks the folder of a game discovered without a store", () => {
    expect(
      getBannerlordMainExe(xboxFolder, apiWith({ path: xboxFolder })),
    ).toBe(XBOX_EXE);
    expect(
      getBannerlordMainExe(steamFolder, apiWith({ path: steamFolder })),
    ).toBe(STANDARD_EXE);
  });

  it("checks a newly picked folder instead of trusting the old folder's store", () => {
    expect(
      getBannerlordMainExe(
        xboxFolder,
        apiWith({ path: steamFolder, store: "steam" }),
      ),
    ).toBe(XBOX_EXE);
    expect(
      getBannerlordMainExe(
        steamFolder,
        apiWith({ path: xboxFolder, store: "xbox" }),
      ),
    ).toBe(STANDARD_EXE);
  });

  it("treats the same folder spelled differently as the discovered one", () => {
    expect(
      getBannerlordMainExe(
        `${steamFolder}${path.sep}`,
        apiWith({ path: steamFolder, store: "xbox" }),
      ),
    ).toBe(XBOX_EXE);
  });

  it("is the standard executable when nothing tells otherwise", () => {
    expect(getBannerlordMainExe(undefined, apiWith({}))).toBe(STANDARD_EXE);
  });
});

describe("BannerlordGame", () => {
  it("finds the game folder through the stores", async () => {
    vi.mocked(findGameAsync).mockResolvedValueOnce({
      gamePath: "C:\\Game",
      gameStoreId: "gog",
    } as types.IGameStoreEntry);

    await expect(new BannerlordGame(apiWith()).queryPath()).resolves.toBe(
      "C:\\Game",
    );
  });

  it("manages the game folder itself, the modules are in its Modules folder", () => {
    const game = new BannerlordGame(apiWith());

    expect(game.queryModPath("C:\\Game")).toBe(".");
    expect(game.requiredFiles).toEqual(["bin", "Modules"]);
    expect(game.details["customOpenModsPath"]).toBe("Modules");
  });

  it("looks the executable up by the discovered store", () => {
    const game = new BannerlordGame(
      apiWith({ path: "C:\\Game", store: "xbox" }),
    );

    expect(game.executable("C:\\Game")).toBe(XBOX_EXE);
    expect(game.executable()).toBe(XBOX_EXE);
  });

  it("reads the version from the game's library", async () => {
    await expect(
      new BannerlordGame(apiWith()).getGameVersion("C:\\Game", "exe"),
    ).resolves.toBe("v1.2.3.0");

    expect(FetchBannerlordVersion.getVersion).toHaveBeenCalledWith(
      "C:\\Game",
      "TaleWorlds.Library.dll",
    );
  });

  it("sets the game up with Vortex's discovery", async () => {
    const api = apiWith();
    const discovery = {
      path: "C:\\Game",
      store: "gog",
    } as types.IDiscoveryResult;

    await new BannerlordGame(api).setup(discovery);

    expect(setupAsync).toHaveBeenCalledWith(api, discovery);
  });
});

describe("getBannerlordToolExe", () => {
  it("puts the tool in the store's binary folder", () => {
    const exe = "Bannerlord.BLSE.Standalone.exe";

    expect(
      getBannerlordToolExe(
        "C:\\Game",
        apiWith({ path: "C:\\Game", store: "xbox" }),
        exe,
      ),
    ).toBe(path.join("bin", "Gaming.Desktop.x64_Shipping_Client", exe));
    expect(
      getBannerlordToolExe(
        "C:\\Game",
        apiWith({ path: "C:\\Game", store: "gog" }),
        exe,
      ),
    ).toBe(path.join("bin", "Win64_Shipping_Client", exe));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { addedFilesEventAsync, installedMod } from "./events";
import { GAME_ID } from "../common";

const vortex = vi.hoisted(() => ({
  removed: [] as string[][],
  removeFails: false,
  gamePath: "",
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  const { mkdir } = await import("node:fs/promises");
  type State = {
    discovery?: { path?: string; store?: string };
    installPath?: string;
  };
  Object.assign(api.selectors, {
    discoveryByGame: (state: State) => state.discovery,
    installPathForGame: (state: State) => state.installPath,
  });
  Object.assign(api.util, {
    renderModName: (mod: { id: string }) => mod.id,
    removeMods: (_api: unknown, _gameId: string, modIds: string[]) => {
      vortex.removed.push(modIds);
      return vortex.removeFails
        ? Promise.reject(new Error("EBUSY"))
        : Promise.resolve();
    },
    getGame: () => ({
      id: "mountandblade2bannerlord",
      getModPaths: () => ({ "": vortex.gamePath }),
    }),
  });
  Object.assign(api.fs, {
    ensureDirAsync: (folder: string) => mkdir(folder, { recursive: true }),
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      localize: (
        template: string,
        options?: { replace?: Record<string, string> },
      ) =>
        template.replace(
          /{{(\w+)}}/g,
          (match, key: string) => options?.replace?.[key] ?? match,
        ),
    }),
  },
}));

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const makeApi = (state: Record<string, unknown>) => {
  const api = {
    getState: () => state,
    sendNotification: vi.fn(),
    showErrorNotification: vi.fn(),
  };
  return api;
};

beforeEach(() => {
  vortex.removed = [];
  vortex.removeFails = false;
});

describe("installedMod", () => {
  const stateWith = (
    availableStores: string[] | undefined,
    store: string | undefined,
  ) => ({
    persistent: {
      mods: {
        [GAME_ID]: {
          mod: {
            id: "mod",
            type: "",
            attributes:
              availableStores !== undefined ? { availableStores } : {},
          },
        },
      },
    },
    discovery: { path: "C:\\Game", store },
  });

  const install = (
    availableStores: string[] | undefined,
    store: string | undefined,
  ) => {
    const api = makeApi(stateWith(availableStores, store));
    installedMod(api as unknown as types.IExtensionApi, "archive", "mod");
    return api;
  };

  it("removes a mod without binaries for the game's store, telling the user", () => {
    const api = install(["Steam", "GOG", "Epic"], "xbox");

    expect(vortex.removed).toEqual([["mod"]]);
    expect(api.sendNotification).toHaveBeenCalledTimes(1);
    expect(api.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        message:
          "'mod' was removed: it doesn't include binaries for the Xbox version of the game",
      }),
    );
  });

  it("reports a mod it couldn't remove", async () => {
    vortex.removeFails = true;

    const api = install(["Steam"], "xbox");
    await flushAsync();

    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Failed to remove the mod",
      expect.any(Error),
    );
  });

  it("keeps a mod with binaries for the game's store", () => {
    install(["Steam", "Xbox"], "xbox");
    install(["Steam"], "steam");

    expect(vortex.removed).toEqual([]);
  });

  it("keeps mods that list no stores, or when the store isn't known", () => {
    install(undefined, "xbox");
    install([], "xbox");
    install(["Steam"], undefined);
    install(["Steam"], "humble");

    expect(vortex.removed).toEqual([]);
  });

  it("ignores mods it doesn't have", () => {
    const api = makeApi(stateWith(["Steam"], "xbox"));

    installedMod(api as unknown as types.IExtensionApi, "archive", "other");

    expect(vortex.removed).toEqual([]);
  });
});

describe("addedFilesEventAsync", () => {
  let root: string;
  let staging: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "bannerlord-added-"));
    vortex.gamePath = path.join(root, "Game");
    staging = path.join(root, "Staging");
    await mkdir(path.join(vortex.gamePath, "Modules", "Mod"), {
      recursive: true,
    });
    await mkdir(staging, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const makeAddedApi = () =>
    makeApi({
      persistent: { mods: { [GAME_ID]: { mod: { id: "mod", type: "" } } } },
      discovery: { path: vortex.gamePath },
      installPath: staging,
    });

  const added = (candidates: string[]) => ({
    filePath: path.join(vortex.gamePath, "Modules", "Mod", "config.xml"),
    candidates,
  });

  it("moves a file changed in the game folder back into its mod", async () => {
    const stagedFile = path.join(
      staging,
      "mod",
      "Modules",
      "Mod",
      "config.xml",
    );
    await mkdir(path.dirname(stagedFile), { recursive: true });
    await writeFile(stagedFile, "old");
    await writeFile(added(["mod"]).filePath, "new");
    const api = makeAddedApi();

    await addedFilesEventAsync(api as unknown as types.IExtensionApi, [
      added(["mod"]),
    ]);

    expect(api.showErrorNotification).not.toHaveBeenCalled();
    expect(await readFile(stagedFile, "utf8")).toBe("new");
    expect(existsSync(added(["mod"]).filePath)).toBe(false);
  });

  it("moves a new file into its mod", async () => {
    await writeFile(added(["mod"]).filePath, "new");
    const api = makeAddedApi();

    await addedFilesEventAsync(api as unknown as types.IExtensionApi, [
      added(["mod"]),
    ]);

    expect(api.showErrorNotification).not.toHaveBeenCalled();
    expect(
      await readFile(
        path.join(staging, "mod", "Modules", "Mod", "config.xml"),
        "utf8",
      ),
    ).toBe("new");
  });

  it("leaves files alone unless exactly one known mod owns them", async () => {
    await writeFile(added([]).filePath, "new");
    const api = makeAddedApi();

    await addedFilesEventAsync(api as unknown as types.IExtensionApi, [
      added([]),
      added(["mod", "other"]),
      added(["unknown"]),
    ]);

    expect(existsSync(added([]).filePath)).toBe(true);
    expect(existsSync(path.join(staging, "mod"))).toBe(false);
  });

  it("reports a file it can't move and still moves the others", async () => {
    await writeFile(added(["mod"]).filePath, "new");
    const gone = {
      filePath: path.join(vortex.gamePath, "Modules", "Mod", "gone.xml"),
      candidates: ["mod"],
    };
    const api = makeAddedApi();

    await addedFilesEventAsync(api as unknown as types.IExtensionApi, [
      gone,
      added(["mod"]),
    ]);

    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Failed to import added file to mod!",
      expect.any(Error),
    );
    expect(
      existsSync(path.join(staging, "mod", "Modules", "Mod", "config.xml")),
    ).toBe(true);
  });

  it("leaves files alone without the game's folder or a staging folder", async () => {
    await writeFile(added(["mod"]).filePath, "new");
    const mods = { [GAME_ID]: { mod: { id: "mod", type: "" } } };
    const noGame = makeApi({ persistent: { mods }, installPath: staging });
    const noStaging = makeApi({
      persistent: { mods },
      discovery: { path: vortex.gamePath },
    });

    await addedFilesEventAsync(noGame as unknown as types.IExtensionApi, [
      added(["mod"]),
    ]);
    await addedFilesEventAsync(noStaging as unknown as types.IExtensionApi, [
      added(["mod"]),
    ]);

    expect(existsSync(added(["mod"]).filePath)).toBe(true);
    expect(existsSync(path.join(staging, "mod"))).toBe(false);
  });
});

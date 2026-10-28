import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { selectors, types, util } from "@nexusmods/vortex-api";
import {
  enableInProfileLoadOrderAsync,
  readLoadOrderAsync,
  readProfileLoadOrderAsync,
  readProfileLoadOrderOrThrowAsync,
  removeProfileLoadOrdersAsync,
  writeLoadOrderAsync,
  writeProfileLoadOrderAsync,
} from "./persistence";
import { bselectors } from "../selectors";
import { GAME_ID } from "../common";
import { IPersistenceLoadOrderEntry } from "../types";

vi.mock("@nexusmods/vortex-api", () => {
  class ProcessCanceled extends Error {}
  return {
    selectors: { installPathForGame: vi.fn(), activeProfile: vi.fn() },
    util: {
      ProcessCanceled,
      writeFileAtomic: vi.fn(),
    },
    log: vi.fn(),
  };
});

vi.mock("../selectors", () => ({
  bselectors: { gameModeForProfile: vi.fn(() => "singleplayer") },
}));

vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const entry = (
  id: string,
  overrides: Partial<IPersistenceLoadOrderEntry> = {},
): IPersistenceLoadOrderEntry => ({
  id,
  name: id,
  isSelected: true,
  isDisabled: false,
  index: 0,
  ...overrides,
});

const createApi = (): types.IExtensionApi =>
  ({
    getState: () => ({}),
    showErrorNotification: vi.fn(),
  }) as unknown as types.IExtensionApi;

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const atomicWrite = (
  write: (filePath: string, contents: string) => Promise<void>,
): typeof util.writeFileAtomic =>
  write as unknown as typeof util.writeFileAtomic;

let dir: string;

const singleplayerFile = (profileId: string): string =>
  path.join(dir, `${profileId}_loadorder.json`);
const multiplayerFile = (profileId: string): string =>
  path.join(dir, `${profileId}_loadorder_multiplayer.json`);

beforeEach(async () => {
  vi.clearAllMocks();
  dir = await mkdtemp(path.join(os.tmpdir(), "bannerlord-loadorder-"));
  vi.mocked(selectors.installPathForGame).mockReturnValue(dir);
  vi.mocked(util.writeFileAtomic).mockImplementation(
    atomicWrite((filePath, contents) => writeFile(filePath, contents)),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readProfileLoadOrderOrThrowAsync", () => {
  it("reads the file of the game mode", async () => {
    await writeFile(singleplayerFile("p1"), JSON.stringify([entry("SP")]));
    await writeFile(multiplayerFile("p1"), JSON.stringify([entry("MP")]));
    const api = createApi();

    const sp = await readProfileLoadOrderOrThrowAsync(
      api,
      "p1",
      "singleplayer",
    );
    const mp = await readProfileLoadOrderOrThrowAsync(api, "p1", "multiplayer");

    expect(sp.map((x) => x.id)).toEqual(["SP"]);
    expect(mp.map((x) => x.id)).toEqual(["MP"]);
  });

  it("reads a missing file as an empty load order", async () => {
    expect(
      await readProfileLoadOrderOrThrowAsync(createApi(), "p1", "singleplayer"),
    ).toEqual([]);
  });

  it("ignores content after the end of the array", async () => {
    await writeFile(
      singleplayerFile("p1"),
      `${JSON.stringify([entry("Native")], null, 2)}\n\0\0garbage`,
    );

    const result = await readProfileLoadOrderOrThrowAsync(
      createApi(),
      "p1",
      "singleplayer",
    );

    expect(result).toEqual([entry("Native")]);
  });

  it("drops entries without an id", async () => {
    await writeFile(
      singleplayerFile("p1"),
      JSON.stringify([entry("Native"), entry(""), { name: "no id" }]),
    );

    const result = await readProfileLoadOrderOrThrowAsync(
      createApi(),
      "p1",
      "singleplayer",
    );

    expect(result.map((x) => x.id)).toEqual(["Native"]);
  });

  it("drops null entries", async () => {
    await writeFile(
      singleplayerFile("p1"),
      `[${JSON.stringify(entry("A"))}, null]`,
    );

    const result = await readProfileLoadOrderOrThrowAsync(
      createApi(),
      "p1",
      "singleplayer",
    );

    expect(result.map((x) => x.id)).toEqual(["A"]);
  });

  it("throws for a file that isn't a load order, so it isn't overwritten", async () => {
    await writeFile(singleplayerFile("p1"), "{ not json");

    await expect(
      readProfileLoadOrderOrThrowAsync(createApi(), "p1", "singleplayer"),
    ).rejects.toThrow(SyntaxError);
  });
});

describe("readProfileLoadOrderAsync", () => {
  it("reports an unreadable load order and reads it as empty", async () => {
    await writeFile(singleplayerFile("p1"), "{ not json");
    const api = createApi();

    const result = await readProfileLoadOrderAsync(api, "p1", "singleplayer");

    expect(result).toEqual([]);
    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
  });
});

describe("writeProfileLoadOrderAsync", () => {
  it("writes the load order that reads back the same", async () => {
    const api = createApi();
    const loadOrder = [
      entry("Native", { index: 0 }),
      entry("Bannerlord.Harmony", { index: 1, isSelected: false }),
    ];

    await writeProfileLoadOrderAsync(api, "p1", "multiplayer", loadOrder);

    expect(
      await readProfileLoadOrderOrThrowAsync(api, "p1", "multiplayer"),
    ).toEqual(loadOrder);
    await expect(readFile(singleplayerFile("p1"))).rejects.toThrow();
  });

  it("runs writes to one file one after another, the last one wins", async () => {
    const api = createApi();
    const firstWrite = deferred();
    const writes: string[] = [];
    vi.mocked(util.writeFileAtomic)
      .mockImplementationOnce(
        atomicWrite(async (filePath, contents) => {
          writes.push("first started");
          await firstWrite.promise;
          await writeFile(filePath, contents);
          writes.push("first done");
        }),
      )
      .mockImplementationOnce(
        atomicWrite(async (filePath, contents) => {
          writes.push("second started");
          await writeFile(filePath, contents);
        }),
      );

    const first = writeProfileLoadOrderAsync(api, "p1", "singleplayer", [
      entry("A"),
      entry("B"),
      entry("C"),
    ]);
    const second = writeProfileLoadOrderAsync(api, "p1", "singleplayer", [
      entry("D"),
    ]);
    await new Promise((r) => setTimeout(r, 10));
    expect(writes).toEqual(["first started"]);
    firstWrite.resolve();
    await Promise.all([first, second]);

    expect(writes).toEqual(["first started", "first done", "second started"]);
    const result = await readProfileLoadOrderOrThrowAsync(
      api,
      "p1",
      "singleplayer",
    );
    expect(result.map((x) => x.id)).toEqual(["D"]);
  });

  it("keeps writing after a write fails, and reports the failure", async () => {
    const api = createApi();
    vi.mocked(util.writeFileAtomic).mockImplementationOnce(
      atomicWrite(() => Promise.reject(new Error("locked"))),
    );

    await writeProfileLoadOrderAsync(api, "p1", "singleplayer", [entry("A")]);
    await writeProfileLoadOrderAsync(api, "p1", "singleplayer", [entry("B")]);

    expect(api.showErrorNotification).toHaveBeenCalledTimes(1);
    const result = await readProfileLoadOrderOrThrowAsync(
      api,
      "p1",
      "singleplayer",
    );
    expect(result.map((x) => x.id)).toEqual(["B"]);
  });

  it("makes a read wait for the write in progress", async () => {
    const api = createApi();
    const write = deferred();
    vi.mocked(util.writeFileAtomic).mockImplementationOnce(
      atomicWrite(async (filePath, contents) => {
        await write.promise;
        await writeFile(filePath, contents);
      }),
    );
    await writeFile(singleplayerFile("p1"), JSON.stringify([entry("Old")]));

    const writing = writeProfileLoadOrderAsync(api, "p1", "singleplayer", [
      entry("New"),
    ]);
    const reading = readProfileLoadOrderOrThrowAsync(api, "p1", "singleplayer");
    write.resolve();
    await writing;

    expect((await reading).map((x) => x.id)).toEqual(["New"]);
  });
});

describe("active profile load order", () => {
  it("cancels the read without an active Bannerlord profile", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue({
      id: "p1",
      gameId: "skyrimse",
    } as types.IProfile);

    await expect(readLoadOrderAsync(createApi())).rejects.toBeInstanceOf(
      util.ProcessCanceled,
    );
  });

  it("skips the write without an active Bannerlord profile, without an error", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue(undefined);
    const api = createApi();

    await writeLoadOrderAsync(api, [entry("Native")]);

    expect(util.writeFileAtomic).not.toHaveBeenCalled();
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it("uses the file of the active profile's game mode", async () => {
    vi.mocked(selectors.activeProfile).mockReturnValue({
      id: "p1",
      gameId: GAME_ID,
    } as types.IProfile);
    vi.mocked(bselectors.gameModeForProfile).mockReturnValue("multiplayer");
    const api = createApi();

    await writeLoadOrderAsync(api, [entry("Native")]);

    expect(JSON.parse(await readFile(multiplayerFile("p1"), "utf8"))).toEqual([
      entry("Native"),
    ]);
    expect((await readLoadOrderAsync(api)).map((x) => x.id)).toEqual([
      "Native",
    ]);
  });
});

describe("enableInProfileLoadOrderAsync", () => {
  it("selects listed modules and appends the missing ones selected", async () => {
    const api = createApi();
    await writeProfileLoadOrderAsync(api, "p1", "multiplayer", [
      entry("Native", { index: 0 }),
      entry("Join", { index: 1, isSelected: false }),
      entry("Other", { index: 2, isSelected: false }),
    ]);

    await enableInProfileLoadOrderAsync(api, "p1", "multiplayer", [
      { id: "Join", name: "Join" },
      { id: "New", name: "New Module" },
    ]);

    const result = await readProfileLoadOrderOrThrowAsync(
      api,
      "p1",
      "multiplayer",
    );
    expect(result.map((x) => [x.id, x.isSelected, x.index])).toEqual([
      ["Native", true, 0],
      ["Join", true, 1],
      ["Other", false, 2],
      ["New", true, 3],
    ]);
    expect(result[3]?.name).toBe("New Module");
  });

  it("doesn't replace a load order it couldn't read", async () => {
    const api = createApi();
    await writeFile(multiplayerFile("p1"), "{ broken");

    await expect(
      enableInProfileLoadOrderAsync(api, "p1", "multiplayer", [
        { id: "Join", name: "Join" },
      ]),
    ).rejects.toThrow();

    expect(await readFile(multiplayerFile("p1"), "utf8")).toBe("{ broken");
  });
});

describe("removeProfileLoadOrdersAsync", () => {
  it("deletes both game modes' files of the profile only", async () => {
    await writeFile(singleplayerFile("p1"), "[]");
    await writeFile(multiplayerFile("p1"), "[]");
    await writeFile(singleplayerFile("p2"), "[]");

    await removeProfileLoadOrdersAsync(createApi(), "p1");

    await expect(readFile(singleplayerFile("p1"))).rejects.toThrow();
    await expect(readFile(multiplayerFile("p1"))).rejects.toThrow();
    expect(await readFile(singleplayerFile("p2"), "utf8")).toBe("[]");
  });

  it("succeeds when the profile has no files", async () => {
    await expect(
      removeProfileLoadOrdersAsync(createApi(), "p1"),
    ).resolves.toBeUndefined();
  });
});

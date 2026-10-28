import os from "os";
import path from "path";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  getGlobalSettingsAsync,
  getSettingsPath,
  getSpecialSettings,
  hasBackupModOptionsAsync,
  overrideModOptionsAsync,
  readSettingsContentAsync,
  removeOriginalModOptionsAsync,
  restoreOriginalModOptionsAsync,
} from "./utils";
import { ModOptionsEntryType, PersistentModOptionsEntry } from "./types";

const documents = vi.hoisted(() => ({ path: "" }));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@nexusmods/vortex-api")>();
  const { mkdir } = await import("node:fs/promises");
  return {
    ...original,
    util: { getVortexPath: () => documents.path },
    fs: {
      ensureDirAsync: (dir: string) => mkdir(dir, { recursive: true }),
    },
  };
});

// turbowalk is native and comes with Vortex: walks the folder the same way, in one batch
vi.mock("turbowalk", async () => {
  const { readdir } = await import("node:fs/promises");
  const nodePath = await import("path");
  const walk = async (
    dir: string,
  ): Promise<{ filePath: string; isDirectory: boolean }[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const filePath = nodePath.join(dir, entry.name);
        const self = { filePath, isDirectory: entry.isDirectory() };
        return entry.isDirectory() ? [self, ...(await walk(filePath))] : [self];
      }),
    );
    return nested.flat();
  };
  return {
    default: async (
      basePath: string,
      callback: (entries: { filePath: string; isDirectory: boolean }[]) => void,
    ) => {
      callback(await walk(basePath));
    },
  };
});

const collection = (archiveId: string): types.IMod =>
  ({ id: `collection-${archiveId}`, archiveId }) as unknown as types.IMod;

const option = (
  type: ModOptionsEntryType,
  relativePath: string,
  content: string,
): PersistentModOptionsEntry => ({
  name: relativePath,
  path: relativePath,
  type,
  contentBase64: Buffer.from(content).toString("base64"),
});

const globalPath = (...parts: string[]): string =>
  path.join(getSettingsPath(), "Global", ...parts);

const put = async (filePath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

const read = (filePath: string): Promise<string> => readFile(filePath, "utf8");

const listFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();

beforeEach(async () => {
  documents.path = await mkdtemp(path.join(os.tmpdir(), "bannerlord-mcm-"));
});

afterEach(async () => {
  await rm(documents.path, { recursive: true, force: true });
});

describe("getSettingsPath", () => {
  it("is the game's ModSettings folder in Documents", () => {
    expect(getSettingsPath()).toBe(
      path.join(
        documents.path,
        "Mount and Blade II Bannerlord",
        "Configs",
        "ModSettings",
      ),
    );
  });
});

describe("getSpecialSettings", () => {
  it("lists ButterLib's options, outside the Global folder", () => {
    expect(getSpecialSettings()).toEqual({
      ButterLib: {
        name: "ButterLib/Options.json",
        path: "ButterLib/Options.json",
        type: ModOptionsEntryType.Special,
      },
    });
  });
});

describe("getGlobalSettingsAsync", () => {
  it("lists every file under Global by its name without extension, nested ones too", async () => {
    await put(globalPath("MCM_v5.json"), "{}");
    await put(globalPath("Diplomacy", "Diplomacy_v1.xml"), "<x/>");

    const settings = await getGlobalSettingsAsync();

    expect(settings).toEqual({
      MCM_v5: {
        name: "MCM_v5.json",
        path: "MCM_v5.json",
        type: ModOptionsEntryType.Global,
      },
      Diplomacy_v1: {
        name: path.join("Diplomacy", "Diplomacy_v1.xml"),
        path: path.join("Diplomacy", "Diplomacy_v1.xml"),
        type: ModOptionsEntryType.Global,
      },
    });
  });

  it("creates the Global folder when it's missing and lists nothing", async () => {
    await expect(getGlobalSettingsAsync()).resolves.toEqual({});
    await expect(listFiles(getSettingsPath())).resolves.toEqual([]);
  });
});

describe("readSettingsContentAsync", () => {
  it("reads a global setting from the Global folder as base64", async () => {
    await put(globalPath("MCM_v5.json"), '{"a":1}');

    const content = await readSettingsContentAsync({
      name: "MCM_v5.json",
      path: "MCM_v5.json",
      type: ModOptionsEntryType.Global,
    });

    expect(Buffer.from(content, "base64").toString()).toBe('{"a":1}');
  });

  it("reads a special setting from the ModSettings folder", async () => {
    await put(path.join(getSettingsPath(), "ButterLib", "Options.json"), "bl");

    const content = await readSettingsContentAsync(
      getSpecialSettings()["ButterLib"]!,
    );

    expect(Buffer.from(content, "base64").toString()).toBe("bl");
  });

  it("is empty for an unknown type", async () => {
    await expect(
      readSettingsContentAsync({
        name: "x",
        path: "x",
        type: "other" as ModOptionsEntryType,
      }),
    ).resolves.toBe("");
  });
});

describe("overrideModOptionsAsync", () => {
  it("writes the collection's options where they belong, creating the folders", async () => {
    await overrideModOptionsAsync(collection("1"), [
      option(ModOptionsEntryType.Global, path.join("Mod", "Mod_v1.json"), "g"),
      option(ModOptionsEntryType.Special, "ButterLib/Options.json", "s"),
    ]);

    await expect(read(globalPath("Mod", "Mod_v1.json"))).resolves.toBe("g");
    await expect(
      read(path.join(getSettingsPath(), "ButterLib", "Options.json")),
    ).resolves.toBe("s");
  });

  it("keeps the user's options as a backup of the collection", async () => {
    const mod = collection("1");
    await put(globalPath("MCM_v5.json"), "mine");

    await overrideModOptionsAsync(mod, [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
    ]);

    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("theirs");
    await expect(hasBackupModOptionsAsync(mod)).resolves.toBe(true);
    await expect(hasBackupModOptionsAsync(collection("2"))).resolves.toBe(
      false,
    );
  });

  it("remembers an option the user didn't have, so restoring can remove it", async () => {
    const mod = collection("1");

    await overrideModOptionsAsync(mod, [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
    ]);

    await expect(hasBackupModOptionsAsync(mod)).resolves.toBe(true);
    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("theirs");
  });

  it("keeps the user's backup when the collection is applied again", async () => {
    const mod = collection("1");
    await put(globalPath("MCM_v5.json"), "mine");
    const options = [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
    ];

    await overrideModOptionsAsync(mod, options);
    await overrideModOptionsAsync(mod, options);
    await restoreOriginalModOptionsAsync(mod);

    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("mine");
  });

  it("keeps an added option added when the collection is applied again", async () => {
    const mod = collection("1");
    const options = [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
    ];

    await overrideModOptionsAsync(mod, options);
    await overrideModOptionsAsync(mod, options);
    await restoreOriginalModOptionsAsync(mod);

    await expect(listFiles(getSettingsPath())).resolves.toEqual([]);
  });

  it.each([
    [ModOptionsEntryType.Global, path.join("..", "..", "evil.txt")],
    [ModOptionsEntryType.Global, path.join("Mod", "..", "..", "evil.txt")],
    [ModOptionsEntryType.Special, path.join("..", "evil.txt")],
    [ModOptionsEntryType.Global, path.resolve(os.tmpdir(), "evil.txt")],
    [ModOptionsEntryType.Global, ""],
  ])("refuses a %s option at '%s', outside its folder", async (type, p) => {
    await overrideModOptionsAsync(collection("1"), [option(type, p, "evil")]);

    await expect(listFiles(documents.path)).resolves.toEqual([]);
  });

  it("allows a name starting with two dots", async () => {
    await overrideModOptionsAsync(collection("1"), [
      option(ModOptionsEntryType.Global, "..MCM.json", "theirs"),
    ]);

    await expect(read(globalPath("..MCM.json"))).resolves.toBe("theirs");
  });

  it("skips options of an unknown type", async () => {
    await overrideModOptionsAsync(collection("1"), [
      option("other" as ModOptionsEntryType, "MCM_v5.json", "theirs"),
    ]);

    await expect(listFiles(documents.path)).resolves.toEqual([]);
  });

  it("writes back exactly what was read", async () => {
    const bytes = Buffer.from([0, 255, 10, 13, 0xef, 0xbb, 0xbf]);
    await mkdir(globalPath(), { recursive: true });
    await writeFile(globalPath("Binary.bin"), bytes);
    const entry = (await getGlobalSettingsAsync())["Binary"]!;
    const contentBase64 = await readSettingsContentAsync(entry);
    await rm(globalPath("Binary.bin"));

    await overrideModOptionsAsync(collection("1"), [
      { ...entry, contentBase64 },
    ]);

    await expect(readFile(globalPath("Binary.bin"))).resolves.toEqual(bytes);
  });
});

describe("restoreOriginalModOptionsAsync", () => {
  it("puts the user's options back over the collection's", async () => {
    const mod = collection("1");
    await put(globalPath("MCM_v5.json"), "mine");
    await put(path.join(getSettingsPath(), "ButterLib", "Options.json"), "bl");
    await overrideModOptionsAsync(mod, [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
      option(ModOptionsEntryType.Special, "ButterLib/Options.json", "theirs"),
    ]);

    await restoreOriginalModOptionsAsync(mod);

    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("mine");
    await expect(
      read(path.join(getSettingsPath(), "ButterLib", "Options.json")),
    ).resolves.toBe("bl");
    await expect(hasBackupModOptionsAsync(mod)).resolves.toBe(false);
  });

  it("removes the options the collection added where the user had none", async () => {
    const mod = collection("1");
    await put(globalPath("MCM_v5.json"), "mine");
    await overrideModOptionsAsync(mod, [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
      option(ModOptionsEntryType.Global, path.join("New", "New.json"), "new"),
    ]);

    await restoreOriginalModOptionsAsync(mod);

    await expect(listFiles(getSettingsPath())).resolves.toEqual([
      path.join("Global", "MCM_v5.json"),
    ]);
    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("mine");
    await expect(hasBackupModOptionsAsync(mod)).resolves.toBe(false);
  });

  it("finds backups made before the added markers", async () => {
    const mod = collection("1");
    await put(globalPath("MCM_v5.json"), "theirs");
    await put(globalPath("MCM_v5.json.bak.vortex.1}"), "mine");

    await restoreOriginalModOptionsAsync(mod);

    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("mine");
  });

  it("leaves the backups of other collections alone", async () => {
    await put(globalPath("A.json"), "mine A");
    await put(globalPath("B.json"), "mine B");
    await overrideModOptionsAsync(collection("1"), [
      option(ModOptionsEntryType.Global, "A.json", "theirs"),
    ]);
    await overrideModOptionsAsync(collection("2"), [
      option(ModOptionsEntryType.Global, "B.json", "theirs"),
    ]);

    await restoreOriginalModOptionsAsync(collection("1"));

    await expect(read(globalPath("A.json"))).resolves.toBe("mine A");
    await expect(read(globalPath("B.json"))).resolves.toBe("theirs");
    await expect(hasBackupModOptionsAsync(collection("2"))).resolves.toBe(true);
  });
});

describe("removeOriginalModOptionsAsync", () => {
  it("deletes the backups and keeps the collection's options", async () => {
    const mod = collection("1");
    await put(globalPath("MCM_v5.json"), "mine");
    await overrideModOptionsAsync(mod, [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
    ]);

    await removeOriginalModOptionsAsync(mod);

    await expect(hasBackupModOptionsAsync(mod)).resolves.toBe(false);
    await expect(listFiles(getSettingsPath())).resolves.toEqual([
      path.join("Global", "MCM_v5.json"),
    ]);
    await expect(read(globalPath("MCM_v5.json"))).resolves.toBe("theirs");
  });

  it("keeps the options the collection added", async () => {
    const mod = collection("1");
    await overrideModOptionsAsync(mod, [
      option(ModOptionsEntryType.Global, "MCM_v5.json", "theirs"),
    ]);

    await removeOriginalModOptionsAsync(mod);

    await expect(hasBackupModOptionsAsync(mod)).resolves.toBe(false);
    await expect(listFiles(getSettingsPath())).resolves.toEqual([
      path.join("Global", "MCM_v5.json"),
    ]);
  });
});

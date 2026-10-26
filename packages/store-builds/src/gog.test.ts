import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { deflateRawSync } from "zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHashDbAsync, readGogBuildAsync } from "./gog";

const MD5 = "0123456789abcdef0123456789abcdef";

const zipOneFile = (content: Buffer, deflate = true): Buffer => {
  const name = Buffer.from("hashdb", "utf8");
  const data = deflate ? deflateRawSync(content) : content;
  const method = deflate ? 8 : 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
};

/**
 * The table GOG zips into a hash list: a header, then each file's path zero padded and its MD5
 */
const hashTable = (
  paths: string[],
  pathSize = 260,
  headerSize = 16,
): Buffer => {
  const header = Buffer.alloc(headerSize);
  header.writeUInt32LE(headerSize, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(paths.length, 8);
  const records = paths.map((filePath) => {
    const record = Buffer.alloc(pathSize + MD5.length);
    record.write(filePath, 0, pathSize, "utf8");
    record.write(MD5, pathSize, "latin1");
    return record;
  });
  return Buffer.concat([header, ...records]);
};

const hashDb = (paths: string[], deflate = true): Buffer =>
  zipOneFile(hashTable(paths), deflate);

describe("parseHashDbAsync", () => {
  it("reads the path of each record", async () => {
    const paths = [
      "bin\\Win64_Shipping_Client\\Bannerlord.exe",
      "Modules\\Native\\SubModule.xml",
    ];

    expect(await parseHashDbAsync(hashDb(paths))).toEqual(paths);
    expect(await parseHashDbAsync(hashDb(paths, false))).toEqual(paths);
  });

  it("reads non-ASCII paths as UTF-8", async () => {
    expect(await parseHashDbAsync(hashDb(["Modules\\Ünïcode\\ä.xml"]))).toEqual(
      ["Modules\\Ünïcode\\ä.xml"],
    );
  });

  it("reads a path that fills its whole field, without the MD5", async () => {
    const filePath = "a".repeat(8);

    expect(
      await parseHashDbAsync(
        zipOneFile(hashTable([filePath], filePath.length)),
      ),
    ).toEqual([filePath]);
  });

  it("reads an empty list", async () => {
    expect(await parseHashDbAsync(zipOneFile(hashTable([])))).toEqual([]);
  });

  it("throws on records that don't fit the table", async () => {
    const table = Buffer.concat([
      hashTable(["a.txt", "b.txt"]),
      Buffer.alloc(1),
    ]);

    await expect(parseHashDbAsync(zipOneFile(table))).rejects.toThrow(
      "unknown layout",
    );
  });

  it("throws on records too short for an MD5", async () => {
    await expect(
      parseHashDbAsync(zipOneFile(hashTable(["a.txt"], 0))),
    ).rejects.toThrow("unknown layout");
  });

  it("throws on data that isn't a zip", async () => {
    await expect(parseHashDbAsync(Buffer.alloc(64))).rejects.toThrow(
      "central directory",
    );
  });
});

describe("readGogBuildAsync", () => {
  let root: string;
  let gamePath: string;
  let programData: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-gog-"));
    gamePath = path.join(root, "Game");
    programData = path.join(root, "ProgramData");
    await fs.mkdir(gamePath);
    // Away from the machine's own Galaxy
    vi.stubEnv("PROGRAMDATA", programData);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeProductAsync = async (
    info: Record<string, unknown>,
    paths: string[] | undefined,
    options: { bom?: boolean } = {},
  ): Promise<void> => {
    const gameId = String(info["gameId"]);
    await fs.writeFile(
      path.join(gamePath, `goggame-${gameId}.info`),
      (options.bom === true ? "﻿" : "") + JSON.stringify(info),
    );
    if (paths !== undefined) {
      await fs.writeFile(
        path.join(gamePath, `goggame-${gameId}.hashdb`),
        hashDb(paths),
      );
    }
  };

  const writeGalaxyDatabaseAsync = async (
    storagePath: string,
    files: { productId: number; path: string; chunks: number[] }[],
  ): Promise<void> => {
    await fs.mkdir(storagePath, { recursive: true });
    const database = new DatabaseSync(path.join(storagePath, "galaxy-2.0.db"));
    try {
      database.exec(
        "CREATE TABLE GameFiles (id INTEGER PRIMARY KEY, productId INTEGER, installPath TEXT);" +
          "CREATE TABLE GameFileChunkHashes (productFileId INTEGER, size INTEGER);",
      );
      const insertFile = database.prepare(
        "INSERT INTO GameFiles (id, productId, installPath) VALUES (?, ?, ?)",
      );
      const insertChunk = database.prepare(
        "INSERT INTO GameFileChunkHashes (productFileId, size) VALUES (?, ?)",
      );
      files.forEach((file, index) => {
        insertFile.run(index + 1, file.productId, file.path);
        for (const size of file.chunks) {
          insertChunk.run(index + 1, size);
        }
      });
    } finally {
      database.close();
    }
  };

  it("reads the files of the game and its DLCs, without sizes when Galaxy isn't there", async () => {
    await writeProductAsync(
      { gameId: "1802539526", rootGameId: "1802539526", buildId: "5555" },
      ["bin\\Bannerlord.exe"],
      { bom: true },
    );
    await writeProductAsync(
      { gameId: "1234567890", rootGameId: "1802539526", buildId: "1" },
      ["Modules\\DLC\\SubModule.xml"],
    );

    const build = await readGogBuildAsync(gamePath);

    expect(build.buildId).toBe("5555");
    expect(build.productId).toBe("1802539526");
    expect(build.missingLists).toEqual([]);
    expect(build.files).toEqual(
      expect.arrayContaining([
        { path: "bin\\Bannerlord.exe" },
        { path: "Modules\\DLC\\SubModule.xml" },
      ]),
    );
    expect(build.files).toHaveLength(2);
  });

  it("takes the product that isn't a DLC as the game, whichever info comes first", async () => {
    await writeProductAsync(
      { gameId: "1000000000", rootGameId: "1802539526", buildId: "dlc" },
      ["dlc.txt"],
    );
    await writeProductAsync({ gameId: "1802539526", buildId: "game" }, [
      "game.txt",
    ]);

    const build = await readGogBuildAsync(gamePath);

    expect(build.productId).toBe("1802539526");
    expect(build.buildId).toBe("game");
  });

  it("lists the products whose hash list is gone as missing", async () => {
    await writeProductAsync({ gameId: "1802539526", buildId: "1" }, ["a.txt"]);
    await writeProductAsync(
      { gameId: "1234567890", rootGameId: "1802539526" },
      undefined,
    );

    const build = await readGogBuildAsync(gamePath);

    expect(build.missingLists).toEqual(["1234567890"]);
    expect(build.files).toEqual([{ path: "a.txt" }]);
  });

  it("has an empty build id when the info doesn't tell it", async () => {
    await writeProductAsync({ gameId: "1802539526" }, ["a.txt"]);

    expect((await readGogBuildAsync(gamePath)).buildId).toBe("");
  });

  it("ignores infos without a game id", async () => {
    await fs.writeFile(
      path.join(gamePath, "goggame-1.info"),
      JSON.stringify({ name: "x" }),
    );

    await expect(readGogBuildAsync(gamePath)).rejects.toThrow(
      "game info wasn't found",
    );
  });

  it("throws without the game info", async () => {
    await expect(readGogBuildAsync(gamePath)).rejects.toThrow(
      "game info wasn't found",
    );
  });

  it("takes the files' sizes from Galaxy's database, by path ignoring case and separators", async () => {
    await writeProductAsync({ gameId: "1802539526", buildId: "1" }, [
      "bin\\Bannerlord.exe",
      "Modules\\Native\\SubModule.xml",
      "unknown.txt",
    ]);
    await writeGalaxyDatabaseAsync(
      path.join(programData, "GOG.com", "Galaxy", "storage"),
      [
        {
          productId: 1802539526,
          path: "BIN\\bannerlord.exe",
          chunks: [100, 50],
        },
        {
          productId: 1802539526,
          path: "modules/native/submodule.xml",
          chunks: [],
        },
        { productId: 42, path: "unknown.txt", chunks: [9] },
      ],
    );

    const build = await readGogBuildAsync(gamePath);

    expect(build.files).toEqual([
      { path: "bin\\Bannerlord.exe", size: 150 },
      { path: "Modules\\Native\\SubModule.xml", size: 0 },
      { path: "unknown.txt" },
    ]);
  });

  it("finds Galaxy's database in the storage folder its config names", async () => {
    const storagePath = path.join(root, "Elsewhere");
    await fs.mkdir(path.join(programData, "GOG.com", "Galaxy"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(programData, "GOG.com", "Galaxy", "config.json"),
      JSON.stringify({ storagePath }),
    );
    await writeGalaxyDatabaseAsync(storagePath, [
      { productId: 1802539526, path: "a.txt", chunks: [3] },
    ]);
    await writeProductAsync({ gameId: "1802539526" }, ["a.txt"]);

    expect((await readGogBuildAsync(gamePath)).files).toEqual([
      { path: "a.txt", size: 3 },
    ]);
  });

  it("has no sizes when Galaxy's database has another schema", async () => {
    const storagePath = path.join(programData, "GOG.com", "Galaxy", "storage");
    await fs.mkdir(storagePath, { recursive: true });
    const database = new DatabaseSync(path.join(storagePath, "galaxy-2.0.db"));
    database.exec("CREATE TABLE Other (id INTEGER)");
    database.close();
    await writeProductAsync({ gameId: "1802539526" }, ["a.txt"]);

    expect((await readGogBuildAsync(gamePath)).files).toEqual([
      { path: "a.txt" },
    ]);
  });
});

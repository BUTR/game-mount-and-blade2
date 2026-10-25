import { promises as fs } from "fs";
import path from "path";
import { IExpectedFile, IStoreBuild } from "./types";
import { readFirstZipEntry } from "./zip";
import { getPathExistsAsync } from "@bannerlord/core/utils";

/**
 * goggame-{productId}.info, the game's and each installed DLC's
 */
interface IGogGameInfo {
  gameId: string;
  rootGameId?: string;
  buildId?: string;
}

const MD5_LENGTH = 32;

/**
 * goggame-{productId}.hashdb, a zip of a table: a header of its size, a version and the record count, then a record
 * per file of the product, its path zero padded and its MD5 as hex
 */
export const parseHashDb = (data: Buffer): string[] => {
  const table = readFirstZipEntry(data);
  const headerSize = table.readUInt32LE(0);
  const count = table.readUInt32LE(8);
  const recordSize = count > 0 ? (table.length - headerSize) / count : 0;
  if (!Number.isInteger(recordSize) || recordSize <= MD5_LENGTH) {
    throw new Error("The GOG hash list has an unknown layout");
  }

  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = headerSize + i * recordSize;
    const pathEnd = table.indexOf(0, start);
    const end =
      pathEnd < 0 || pathEnd > start + recordSize - MD5_LENGTH
        ? start + recordSize - MD5_LENGTH
        : pathEnd;
    paths.push(table.toString("utf8", start, end));
  }
  return paths;
};

const readGameInfosAsync = async (
  gamePath: string,
): Promise<IGogGameInfo[]> => {
  const infos: IGogGameInfo[] = [];
  for (const name of await fs.readdir(gamePath)) {
    if (!/^goggame-\d+\.info$/i.test(name)) {
      continue;
    }
    const text = await fs.readFile(path.join(gamePath, name), "utf8");
    // Galaxy writes it with a BOM
    const info = JSON.parse(text.replace(/^\uFEFF/, "")) as IGogGameInfo;
    if (typeof info.gameId === "string") {
      infos.push(info);
    }
  }
  return infos;
};

const getGalaxyDatabasePath = (): string =>
  path.join(
    process.env["PROGRAMDATA"] ?? "C:\\ProgramData",
    "GOG.com",
    "Galaxy",
    "storage",
    "galaxy-2.0.db",
  );

/**
 * The sizes of the products' files, by their lowercased path. Galaxy keeps them for the games it installed, the
 * hash lists don't have them. Undefined without Galaxy or when it doesn't know the products
 */
const readGalaxySizesAsync = async (
  productIds: readonly string[],
): Promise<Map<string, number> | undefined> => {
  const databasePath = getGalaxyDatabasePath();
  if (!(await getPathExistsAsync(databasePath))) {
    return undefined;
  }
  try {
    // Loaded only for GOG, Node warns that it's experimental
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const placeholders = productIds.map(() => "?").join(", ");
      const rows = database
        .prepare(
          `SELECT f.installPath AS path, COALESCE(SUM(c.size), 0) AS size
           FROM GameFiles f LEFT JOIN GameFileChunkHashes c ON c.productFileId = f.id
           WHERE f.productId IN (${placeholders})
           GROUP BY f.id`,
        )
        .all(...productIds.map(Number));
      if (rows.length === 0) {
        return undefined;
      }
      const sizes = new Map<string, number>();
      for (const row of rows) {
        sizes.set(
          String(row["path"]).replace(/\\/g, "/").toLowerCase(),
          Number(row["size"]),
        );
      }
      return sizes;
    } finally {
      database.close();
    }
  } catch {
    // Galaxy's schema changed, or its database is locked
    return undefined;
  }
};

/**
 * The files of the build GOG installed, from the hash list each product installs next to the game. The sizes come
 * from Galaxy, when it installed the game. No network or login needed
 */
export const readGogBuildAsync = async (
  gamePath: string,
): Promise<IStoreBuild> => {
  const infos = await readGameInfosAsync(gamePath);
  const game =
    infos.find(
      (info) =>
        info.rootGameId === undefined || info.rootGameId === info.gameId,
    ) ?? infos[0];
  if (game === undefined) {
    throw new Error(`GOG's game info wasn't found in '${gamePath}'`);
  }

  const paths: string[] = [];
  const missingLists: string[] = [];
  for (const { gameId } of infos) {
    const hashDbPath = path.join(gamePath, `goggame-${gameId}.hashdb`);
    if (!(await getPathExistsAsync(hashDbPath))) {
      missingLists.push(gameId);
      continue;
    }
    paths.push(...parseHashDb(await fs.readFile(hashDbPath)));
  }

  const sizes = await readGalaxySizesAsync(infos.map((info) => info.gameId));
  const files = paths.map((filePath): IExpectedFile => {
    const size = sizes?.get(filePath.replace(/\\/g, "/").toLowerCase());
    return size !== undefined ? { path: filePath, size } : { path: filePath };
  });

  return {
    buildId: game.buildId ?? "",
    productId: game.gameId,
    files,
    missingLists,
  };
};

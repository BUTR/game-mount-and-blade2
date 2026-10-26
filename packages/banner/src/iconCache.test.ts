import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ICON_RESOLUTION, MOMENT_CHANNELS } from "./iconMoments";

const MOMENT_VALUES = MOMENT_CHANNELS * ICON_RESOLUTION * ICON_RESOLUTION;

type IconCacheModule = typeof import("./iconCache");

let dir: string;
let cacheDir: string;
let packagePath: string;
let iconCache: IconCacheModule;

/**
 * The cache module as a new session loads it, with nothing in memory
 */
const newSessionAsync = async (): Promise<IconCacheModule> => {
  vi.resetModules();
  iconCache = await import("./iconCache");
  return iconCache;
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "icon-cache-"));
  cacheDir = path.join(dir, "cache");
  packagePath = path.join(
    dir,
    "game",
    "Modules",
    "Native",
    "AssetPackages",
    "core.tpac",
  );
  await fs.mkdir(path.dirname(packagePath), { recursive: true });
  await fs.writeFile(packagePath, "package v1");
  await newSessionAsync();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const momentsOf = (seed: number): Uint16Array =>
  Uint16Array.from({ length: MOMENT_VALUES }, (_, i) => (i * seed) & 0xffff);

// Compared by hash, comparing 80k values one by one is slow
const digest = (moments: Uint16Array | null): string | null =>
  moments === null ? null : createHash("sha256").update(moments).digest("hex");

const source = (filePath = packagePath, guid = "texture-guid") => ({
  filePath,
  guid,
});

const getAsync = (
  cell: number,
  moments: Uint16Array | null,
  textureSource = source(),
) => {
  const compute = vi.fn(() => Promise.resolve(moments));
  const result = iconCache.getCachedIconMomentsAsync(
    cacheDir,
    textureSource,
    cell,
    compute,
  );
  return { result, compute };
};

describe("getCachedIconMomentsAsync", () => {
  it("computes an icon the first time and reads it from the cache after", async () => {
    const first = getAsync(3, momentsOf(7));
    expect(digest(await first.result)).toBe(digest(momentsOf(7)));
    expect(first.compute).toHaveBeenCalledOnce();

    const second = getAsync(3, momentsOf(99));
    expect(digest(await second.result)).toBe(digest(momentsOf(7)));
    expect(second.compute).not.toHaveBeenCalled();
  });

  it("keeps icons on disk for the next session", async () => {
    await getAsync(0, momentsOf(3)).result;
    await getAsync(15, momentsOf(5)).result;
    await getAsync(1, momentsOf(11), source(packagePath, "other-texture"))
      .result;

    await newSessionAsync();

    const cell0 = getAsync(0, null);
    const cell15 = getAsync(15, null);
    const other = getAsync(1, null, source(packagePath, "other-texture"));
    expect(digest(await cell0.result)).toBe(digest(momentsOf(3)));
    expect(digest(await cell15.result)).toBe(digest(momentsOf(5)));
    expect(digest(await other.result)).toBe(digest(momentsOf(11)));
    expect(cell0.compute).not.toHaveBeenCalled();
    expect(cell15.compute).not.toHaveBeenCalled();
    expect(other.compute).not.toHaveBeenCalled();
  });

  it("keys icons by texture and cell", async () => {
    await getAsync(2, momentsOf(3)).result;

    const otherCell = getAsync(4, momentsOf(5));
    const otherTexture = getAsync(2, momentsOf(9), source(packagePath, "x"));

    expect(digest(await otherCell.result)).toBe(digest(momentsOf(5)));
    expect(digest(await otherTexture.result)).toBe(digest(momentsOf(9)));
    expect(otherCell.compute).toHaveBeenCalledOnce();
    expect(otherTexture.compute).toHaveBeenCalledOnce();
  });

  it("stores icons computed at the same time one after the other", async () => {
    const icons = Array.from({ length: 6 }, (_, cell) =>
      getAsync(cell, momentsOf(cell + 2)),
    );
    await Promise.all(icons.map((icon) => icon.result));

    await newSessionAsync();

    for (let cell = 0; cell < 6; cell++) {
      const icon = getAsync(cell, null);
      expect(digest(await icon.result)).toBe(digest(momentsOf(cell + 2)));
      expect(icon.compute).not.toHaveBeenCalled();
    }
  });

  it("computes cells outside the atlas without caching them", async () => {
    for (const cell of [-1, 16, 1.5, NaN]) {
      const icon = getAsync(cell, momentsOf(3));
      expect(digest(await icon.result)).toBe(digest(momentsOf(3)));
      expect(icon.compute).toHaveBeenCalledOnce();
    }
    await expect(fs.stat(cacheDir)).rejects.toThrow();
  });

  it("doesn't cache an icon that couldn't be computed", async () => {
    expect(await getAsync(3, null).result).toBeNull();

    const retry = getAsync(3, momentsOf(4));
    expect(digest(await retry.result)).toBe(digest(momentsOf(4)));
    expect(retry.compute).toHaveBeenCalledOnce();
  });

  it("starts over when the package changed since the icons were cached", async () => {
    await getAsync(3, momentsOf(7)).result;
    await fs.writeFile(packagePath, "package v2, a game update");

    await newSessionAsync();
    const icon = getAsync(3, momentsOf(8));

    expect(digest(await icon.result)).toBe(digest(momentsOf(8)));
    expect(icon.compute).toHaveBeenCalledOnce();
  });

  it("starts over for a package of another install", async () => {
    await getAsync(3, momentsOf(7)).result;
    const otherPackage = path.join(dir, "other game", "core.tpac");
    await fs.mkdir(path.dirname(otherPackage), { recursive: true });
    await fs.writeFile(otherPackage, "package v1");

    const other = getAsync(3, momentsOf(8), source(otherPackage));
    expect(digest(await other.result)).toBe(digest(momentsOf(8)));
    expect(other.compute).toHaveBeenCalledOnce();

    await newSessionAsync();
    const back = getAsync(3, momentsOf(9));
    expect(digest(await back.result)).toBe(digest(momentsOf(9)));
    expect(back.compute).toHaveBeenCalledOnce();
  });

  it("computes the icon again when the data file lost it", async () => {
    await getAsync(3, momentsOf(7)).result;
    await fs.truncate(path.join(cacheDir, "icons.bin"), 0);

    await newSessionAsync();
    const icon = getAsync(3, momentsOf(8));

    expect(digest(await icon.result)).toBe(digest(momentsOf(8)));
    expect(icon.compute).toHaveBeenCalledOnce();
  });

  it("ignores an index it can't read", async () => {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, "icons.json"), "{ not json");

    const icon = getAsync(3, momentsOf(8));

    expect(digest(await icon.result)).toBe(digest(momentsOf(8)));
    expect(icon.compute).toHaveBeenCalledOnce();
  });

  it("ignores an index of another format", async () => {
    await getAsync(3, momentsOf(7)).result;
    const indexPath = path.join(cacheDir, "icons.json");
    const index = JSON.parse(await fs.readFile(indexPath, "utf8")) as Record<
      string,
      unknown
    >;
    await fs.writeFile(indexPath, JSON.stringify({ ...index, resolution: 64 }));

    await newSessionAsync();
    const icon = getAsync(3, momentsOf(8));

    expect(digest(await icon.result)).toBe(digest(momentsOf(8)));
    expect(icon.compute).toHaveBeenCalledOnce();
  });

  it("computes icons when the cache folder can't be made", async () => {
    await fs.writeFile(path.join(dir, "file"), "");
    cacheDir = path.join(dir, "file", "cache");

    const icon = getAsync(3, momentsOf(8));

    expect(digest(await icon.result)).toBe(digest(momentsOf(8)));
    expect(icon.compute).toHaveBeenCalledOnce();
  });
});

describe("purgeIconCacheAsync", () => {
  it("deletes the cached icons, in memory and on disk", async () => {
    await getAsync(3, momentsOf(7)).result;

    await iconCache.purgeIconCacheAsync(cacheDir);

    expect((await fs.readdir(cacheDir)).sort()).toEqual([]);
    const icon = getAsync(3, momentsOf(8));
    expect(digest(await icon.result)).toBe(digest(momentsOf(8)));
    expect(icon.compute).toHaveBeenCalledOnce();
  });
});

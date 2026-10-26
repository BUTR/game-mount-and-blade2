import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPathExistsAsync, readFileIfExistsAsync } from "./fsUtils";

describe("fsUtils", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-fs-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe("getPathExistsAsync", () => {
    it("tells files and folders that exist from paths that don't", async () => {
      await fs.writeFile(path.join(root, "a.txt"), "a");

      expect(await getPathExistsAsync(path.join(root, "a.txt"))).toBe(true);
      expect(await getPathExistsAsync(root)).toBe(true);
      expect(await getPathExistsAsync(path.join(root, "missing"))).toBe(false);
    });
  });

  describe("readFileIfExistsAsync", () => {
    it("reads the file's contents", async () => {
      await fs.writeFile(path.join(root, "a.bin"), Buffer.from([1, 2, 3]));

      expect(await readFileIfExistsAsync(path.join(root, "a.bin"))).toEqual(
        Buffer.from([1, 2, 3]),
      );
    });

    it("is undefined for a file that doesn't exist, or a path through a file", async () => {
      await fs.writeFile(path.join(root, "a.txt"), "a");

      expect(await readFileIfExistsAsync(path.join(root, "missing"))).toBe(
        undefined,
      );
      expect(
        await readFileIfExistsAsync(path.join(root, "a.txt", "inside")),
      ).toBe(undefined);
    });

    it("throws for a path that exists but can't be read as a file", async () => {
      await expect(readFileIfExistsAsync(root)).rejects.toThrow();
    });
  });
});

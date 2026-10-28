import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getPathExistsAsync,
  isFileNotFoundError,
  isSymlinkLoopError,
} from "./fsUtils";

const errorWithCode = (code: string): Error =>
  Object.assign(new Error(code), { code });

describe("getPathExistsAsync", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "bannerlord-fsutils-"));
    await writeFile(path.join(dir, "file.txt"), "");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is true for existing files and folders", async () => {
    expect(await getPathExistsAsync(dir)).toBe(true);
    expect(await getPathExistsAsync(path.join(dir, "file.txt"))).toBe(true);
  });

  it("is false for a missing path instead of throwing", async () => {
    expect(await getPathExistsAsync(path.join(dir, "missing"))).toBe(false);
  });
});

describe("error classification", () => {
  it("recognizes a missing file by its code", () => {
    expect(isFileNotFoundError(errorWithCode("ENOENT"))).toBe(true);
    expect(isFileNotFoundError(errorWithCode("EACCES"))).toBe(false);
    expect(isSymlinkLoopError(errorWithCode("ELOOP"))).toBe(true);
    expect(isSymlinkLoopError(errorWithCode("ENOENT"))).toBe(false);
  });

  it("rejects values that aren't errors", () => {
    expect(isFileNotFoundError({ code: "ENOENT" })).toBe(false);
    expect(isFileNotFoundError("ENOENT")).toBe(false);
    expect(isFileNotFoundError(undefined)).toBe(false);
  });
});

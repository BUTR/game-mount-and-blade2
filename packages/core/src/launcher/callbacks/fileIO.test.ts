import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { types } from "@nexusmods/vortex-api";
import {
  readDirectoryFileListCallback,
  readDirectoryListCallback,
  readFileContentCallback,
  writeFileContentCallback,
} from "./fileIO";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

vi.mock("@butr/vortexextensionnative", () => ({
  allocWithoutOwnership: () => undefined,
}));

vi.mock("../../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

const errorWithCode = (code: string): Error =>
  Object.assign(new Error(code), { code });

const createApi = (): types.IExtensionApi =>
  ({ showErrorNotification: vi.fn() }) as unknown as types.IExtensionApi;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bannerlord-fileio-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readFileContentCallback", () => {
  it("reads the whole file for a length of -1", async () => {
    const filePath = path.join(dir, "SubModule.xml");
    await writeFile(filePath, "<Module />");

    const result = await readFileContentCallback(createApi())(filePath, 0, -1);

    expect(Buffer.from(result!).toString()).toBe("<Module />");
  });

  it("reads the requested slice", async () => {
    const filePath = path.join(dir, "data.bin");
    await writeFile(filePath, "0123456789");

    const result = await readFileContentCallback(createApi())(filePath, 3, 4);

    expect(Buffer.from(result!).toString()).toBe("3456");
  });

  it("answers a missing file with null and no error", async () => {
    const api = createApi();

    const result = await readFileContentCallback(api)(
      path.join(dir, "missing.xml"),
      0,
      -1,
    );

    expect(result).toBeNull();
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });

  it("reports other read failures and answers null", async () => {
    const api = createApi();
    vi.mocked(open).mockRejectedValueOnce(errorWithCode("EACCES"));

    const result = await readFileContentCallback(api)(
      path.join(dir, "locked.xml"),
      0,
      -1,
    );

    expect(result).toBeNull();
    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Error reading file content",
      expect.anything(),
    );
  });

  it("warns once about a symbolic link loop instead of reporting an error", async () => {
    const api = createApi();
    vi.mocked(open).mockRejectedValueOnce(errorWithCode("ELOOP"));

    const result = await readFileContentCallback(api)(
      path.join(dir, "loop.xml"),
      0,
      -1,
    );

    expect(result).toBeNull();
    expect(api.showErrorNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      { id: "bannerlord-symlink-loop", warning: true },
    );
  });
});

describe("writeFileContentCallback", () => {
  it("writes the data", async () => {
    const filePath = path.join(dir, "out.bin");

    await writeFileContentCallback(createApi())(
      filePath,
      new Uint8Array([104, 105]),
    );

    expect(await readFile(filePath, "utf8")).toBe("hi");
  });

  it("deletes the file for null data", async () => {
    const filePath = path.join(dir, "out.bin");
    await writeFile(filePath, "data");

    await writeFileContentCallback(createApi())(
      filePath,
      null as unknown as Uint8Array,
    );

    await expect(readFile(filePath)).rejects.toThrow();
  });

  it("ignores deleting a file that doesn't exist", async () => {
    const api = createApi();

    await writeFileContentCallback(api)(
      path.join(dir, "missing.bin"),
      null as unknown as Uint8Array,
    );

    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });
});

describe("directory listing callbacks", () => {
  beforeEach(async () => {
    await mkdir(path.join(dir, "Native"));
    await mkdir(path.join(dir, "SandBox"));
    await writeFile(path.join(dir, "readme.txt"), "");
  });

  it("lists the full paths of the files only", async () => {
    const result = await readDirectoryFileListCallback(createApi())(dir);

    expect(result).toEqual([path.join(dir, "readme.txt")]);
  });

  it("lists the full paths of the folders only", async () => {
    const result = await readDirectoryListCallback(createApi())(dir);

    expect(result?.sort()).toEqual([
      path.join(dir, "Native"),
      path.join(dir, "SandBox"),
    ]);
  });

  it("answers a missing folder with null and no error", async () => {
    const api = createApi();

    const result = await readDirectoryListCallback(api)(
      path.join(dir, "Missing"),
    );

    expect(result).toBeNull();
    expect(api.showErrorNotification).not.toHaveBeenCalled();
  });
});

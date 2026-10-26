import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { deflateSync } from "zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IVerifyBuildRequest,
  IVerifyBuildResult,
  VERIFY_WORKER_FILE,
  verifyBuildAsync,
  verifyBuildInWorkerAsync,
} from "./verifyBuild";
import { loadUnmodifiedReaderAsync } from "./unmodified";
import { runInWorkerAsync } from "@bannerlord/worker/client";

vi.mock("./unmodified", () => ({
  loadUnmodifiedReaderAsync: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@bannerlord/worker/client", () => ({ runInWorkerAsync: vi.fn() }));

const u32 = (value: number): Buffer => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return data;
};

const fstring = (text: string): Buffer =>
  Buffer.concat([u32(text.length + 1), Buffer.from(`${text}\0`, "latin1")]);

const withSize = (body: Buffer): Buffer =>
  Buffer.concat([u32(body.length + 4), body]);

/**
 * An Epic build manifest of files of one chunk part each
 */
const epicManifest = (
  buildVersion: string,
  files: { name: string; size: number }[],
): Buffer => {
  const body = Buffer.concat([
    withSize(
      Buffer.concat([
        Buffer.from([0]),
        u32(0),
        Buffer.from([0]),
        u32(0),
        fstring("Chickadee"),
        fstring(buildVersion),
      ]),
    ),
    withSize(Buffer.alloc(0)),
    withSize(
      Buffer.concat([
        Buffer.from([0]),
        u32(files.length),
        ...files.map((file) => fstring(file.name)),
        ...files.map(() => u32(0)),
        Buffer.alloc(files.length * 21),
        ...files.map(() => u32(0)),
        ...files.map((file) =>
          Buffer.concat([u32(1), u32(28), Buffer.alloc(20), u32(file.size)]),
        ),
      ]),
    ),
  ]);
  const header = Buffer.alloc(41);
  header.writeUInt32LE(0x44bec00c, 0);
  header.writeUInt32LE(41, 4);
  header.writeUInt8(1, 36);
  return Buffer.concat([header, deflateSync(body)]);
};

describe("verifyBuildAsync", () => {
  let root: string;

  const request = (
    store: IVerifyBuildRequest["store"],
    overrides: Partial<IVerifyBuildRequest> = {},
  ): IVerifyBuildRequest => ({
    store,
    gamePath: root,
    steamPaths: [],
    epicDataPath: undefined,
    xboxPackageRoots: [],
    ...overrides,
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-verify-"));
    vi.stubEnv("PROGRAMDATA", path.join(root, "ProgramData"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(loadUnmodifiedReaderAsync).mockClear();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("compares the game folder to the store's build", async () => {
    await fs.mkdir(path.join(root, ".egstore"));
    await fs.writeFile(
      path.join(root, ".egstore", "A.manifest"),
      epicManifest("1.2.3.456789", [
        { name: "bin/Bannerlord.exe", size: 4 },
        { name: "missing.txt", size: 1 },
      ]),
    );
    await fs.mkdir(path.join(root, "bin"));
    await fs.writeFile(path.join(root, "bin", "Bannerlord.exe"), "12345");

    const result = await verifyBuildAsync(request("epic"));

    expect(result).toEqual({
      buildId: "1.2.3.456789",
      version: "v1.2.3.456789",
      productId: "Chickadee",
      missingLists: [],
      sizesKnown: true,
      contentsChecked: false,
      packages: [],
      comparison: {
        expectedFileCount: 2,
        extra: [
          {
            path: ".egstore/A.manifest",
            size: expect.any(Number) as number,
            isLink: false,
          },
        ],
        changed: [{ path: "bin/Bannerlord.exe", size: 5, expectedSize: 4 }],
        missing: [{ path: "missing.txt", size: 1 }],
      },
    });
    expect(loadUnmodifiedReaderAsync).not.toHaveBeenCalled();
  });

  it("doesn't compare the folder while a list of the build is missing", async () => {
    await fs.writeFile(
      path.join(root, "goggame-1802539526.info"),
      JSON.stringify({ gameId: "1802539526", buildId: "7" }),
    );

    const result = await verifyBuildAsync(request("gog"));

    expect(result).toEqual({
      buildId: "7",
      productId: "1802539526",
      missingLists: ["1802539526"],
      sizesKnown: false,
      contentsChecked: false,
      packages: [],
    });
  });

  /**
   * An Xbox package whose Content has a.txt of 3 bytes, as its file list says. Returns the Content folder
   */
  const writeXboxPackageAsync = async (): Promise<string> => {
    const contentId = "C5E01182-C50B-4253-8B15-A3376314D4DD";
    const gamePath = path.join(root, "Game", "Content");
    await fs.mkdir(gamePath, { recursive: true });
    const containerHeader = Buffer.alloc(0x400);
    containerHeader.write("msft-xvd", 0x200, "latin1");
    await fs.writeFile(path.join(root, "Game", contentId), containerHeader);
    const metadata = Buffer.alloc(0x28 + 16);
    metadata.write(" PFX", 0, "latin1");
    metadata.writeUInt32LE(0x28, 12);
    metadata.writeUInt32LE(1, 16);
    metadata.writeUInt16LE(5, 0x28 + 2);
    metadata.writeBigUInt64LE(3n, 0x28 + 8);
    await fs.writeFile(
      path.join(root, "Game", `${contentId}.smd`),
      Buffer.concat([metadata, Buffer.from("a.txt", "utf16le")]),
    );
    await fs.writeFile(path.join(gamePath, "a.txt"), "abc");
    return gamePath;
  };

  it("checks Xbox files by their unmodified mark when it can be read", async () => {
    const gamePath = await writeXboxPackageAsync();
    vi.mocked(loadUnmodifiedReaderAsync).mockResolvedValueOnce(() => false);

    const result = await verifyBuildAsync(
      request("xbox", { gamePath, xboxPackageRoots: [gamePath] }),
    );

    expect(result.contentsChecked).toBe(true);
    expect(result.comparison?.changed).toEqual([
      { path: "a.txt", size: 3, expectedSize: 3 },
    ]);
    expect(result.packages).toEqual([]);
  });

  it("compares Xbox files by size alone when the unmodified mark can't be read", async () => {
    const gamePath = await writeXboxPackageAsync();
    await fs.writeFile(path.join(gamePath, "a.txt"), "xyz");

    const result = await verifyBuildAsync(request("xbox", { gamePath }));

    expect(loadUnmodifiedReaderAsync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      buildId: "",
      productId: "",
      missingLists: [],
      sizesKnown: true,
      contentsChecked: false,
      packages: [],
      comparison: {
        expectedFileCount: 1,
        extra: [],
        changed: [],
        missing: [],
      },
    });
  });

  it("rejects when the store's build can't be read", async () => {
    await expect(verifyBuildAsync(request("steam"))).rejects.toThrow(
      "isn't in a Steam library",
    );
  });

  it("runs in the verify worker next to the bundle, with verifyBuildAsync as the job", async () => {
    const result: IVerifyBuildResult = {
      buildId: "1",
      productId: "2",
      missingLists: [],
      sizesKnown: true,
      contentsChecked: false,
      packages: [],
    };
    vi.mocked(runInWorkerAsync).mockResolvedValueOnce(result);
    const steamRequest = request("steam", { steamPaths: ["C:\\Steam"] });

    expect(await verifyBuildInWorkerAsync(steamRequest)).toBe(result);
    expect(runInWorkerAsync).toHaveBeenCalledWith(
      VERIFY_WORKER_FILE,
      steamRequest,
      verifyBuildAsync,
    );
    expect(VERIFY_WORKER_FILE).toBe("verifyWorker.js");
  });
});

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareXboxPackageAsync,
  compareXboxRelatedPackagesAsync,
  parseXboxSegmentMetadata,
  readXboxBuildAsync,
  readXboxProductIdAsync,
} from "./xbox";

const GAME_CONTENT_ID = "C5E01182-C50B-4253-8B15-A3376314D4DD";
const DLC_CONTENT_ID = "E09F018A-028A-471C-B872-3831A45F3460";
const HEADER_SIZE = 0x28;

const buildId = (seed: number): Buffer => Buffer.alloc(16, seed);

const segmentMetadata = (
  files: { path: string; size: number }[],
  options: { build?: Buffer; version?: number } = {},
): Buffer => {
  const header = Buffer.alloc(HEADER_SIZE);
  header.write(" PFX", 0, "latin1");
  header.writeUInt32LE(options.version ?? 4, 4);
  header.writeUInt32LE(HEADER_SIZE, 12);
  header.writeUInt32LE(files.length, 16);
  (options.build ?? buildId(1)).copy(header, 0x18);
  let offset = 0;
  const records = files.map((file) => {
    const record = Buffer.alloc(16);
    record.writeUInt16LE(file.path.length, 2);
    record.writeUInt32LE(offset, 4);
    record.writeBigUInt64LE(BigInt(file.size), 8);
    offset += file.path.length * 2;
    return record;
  });
  const paths = files.map((file) => Buffer.from(file.path, "utf16le"));
  return Buffer.concat([header, ...records, ...paths]);
};

const container = (build: Buffer): Buffer => {
  const header = Buffer.alloc(0x400);
  header.write("msft-xvd", 0x200, "latin1");
  build.copy(header, 0x3ac);
  return header;
};

describe("parseXboxSegmentMetadata", () => {
  it("reads each file's path and size, and the build id", () => {
    const metadata = parseXboxSegmentMetadata(
      segmentMetadata(
        [
          {
            path: "bin\\Gaming.Desktop.x64_Shipping_Client\\Bannerlord.exe",
            size: 1234,
          },
          { path: "Modules\\Native\\big.tpac", size: 2 ** 33 + 1 },
          { path: "appxmanifest.xml", size: 0 },
        ],
        { build: buildId(7) },
      ),
    );

    expect(metadata).toEqual({
      buildId: buildId(7),
      files: [
        {
          path: "bin\\Gaming.Desktop.x64_Shipping_Client\\Bannerlord.exe",
          size: 1234,
        },
        { path: "Modules\\Native\\big.tpac", size: 2 ** 33 + 1 },
        { path: "appxmanifest.xml", size: 0 },
      ],
    });
  });

  it("keeps the build id when the data it was read from changes", () => {
    const data = segmentMetadata([], { build: buildId(7) });
    const metadata = parseXboxSegmentMetadata(data);

    data.fill(0);

    expect(metadata.buildId).toEqual(buildId(7));
  });

  it("throws on data that isn't segment metadata", () => {
    const data = segmentMetadata([]);
    data.write("XXXX", 0, "latin1");

    expect(() => parseXboxSegmentMetadata(data)).toThrow("Not an Xbox");
    expect(() => parseXboxSegmentMetadata(Buffer.from(" PFX"))).toThrow(
      "Not an Xbox",
    );
  });

  it("throws on a format newer than the ones known", () => {
    expect(() =>
      parseXboxSegmentMetadata(segmentMetadata([], { version: 5 })),
    ).toThrow("newer format");
  });

  it("throws when the records or paths are cut short", () => {
    const data = segmentMetadata([{ path: "Modules\\a.xml", size: 1 }]);

    expect(() =>
      parseXboxSegmentMetadata(data.subarray(0, HEADER_SIZE + 8)),
    ).toThrow("cut short");
    expect(() => parseXboxSegmentMetadata(data.subarray(0, -2))).toThrow(
      "cut short",
    );
  });
});

describe("Xbox packages", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-xbox-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  /**
   * A package folder: its container, its segment metadata and its Content with the files. Returns the Content folder
   */
  const writePackageAsync = async (
    folder: string,
    contentId: string,
    options: {
      build?: Buffer;
      metadata?: { name: string; build: Buffer }[];
      expected: { path: string; size: number }[];
      files?: Record<string, string | number>;
      appxManifest?: string;
    },
  ): Promise<string> => {
    const packagePath = path.join(root, folder);
    const contentPath = path.join(packagePath, "Content");
    await fs.mkdir(contentPath, { recursive: true });
    const build = options.build ?? buildId(1);
    await fs.writeFile(path.join(packagePath, contentId), container(build));
    for (const { name, build: metadataBuild } of options.metadata ?? [
      { name: `${contentId}.smd`, build },
    ]) {
      await fs.writeFile(
        path.join(packagePath, name),
        segmentMetadata(options.expected, { build: metadataBuild }),
      );
    }
    for (const [filePath, content] of Object.entries(options.files ?? {})) {
      const target = path.join(contentPath, filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(
        target,
        typeof content === "number" ? Buffer.alloc(content) : content,
      );
    }
    if (options.appxManifest !== undefined) {
      await fs.writeFile(
        path.join(contentPath, "appxmanifest.xml"),
        options.appxManifest,
      );
    }
    return contentPath;
  };

  describe("readXboxBuildAsync", () => {
    it("reads the package's files, its version and the game's Store id", async () => {
      const contentPath = await writePackageAsync(
        "Mount & Blade II- Bannerlord",
        GAME_CONTENT_ID,
        {
          expected: [
            { path: "bin\\Bannerlord.exe", size: 10 },
            { path: "AppxManifest.xml", size: 999 },
          ],
          appxManifest:
            '<Package><Identity Name="TaleWorldsEntertainment.MountBladeIIBannerlord" Publisher="CN=x" Version="1.0.51.0" ProcessorArchitecture="x64"/></Package>',
        },
      );
      await fs.writeFile(
        path.join(contentPath, "MicrosoftGame.Config"),
        "<Game><StoreId>\n  9PDHWZ7X3P03 \n</StoreId></Game>",
      );

      const build = await readXboxBuildAsync(contentPath);

      expect(build).toEqual({
        buildId: "1.0.51.0",
        productId: "9PDHWZ7X3P03",
        files: [
          { path: "bin\\Bannerlord.exe", size: 10 },
          // Windows rewrites it, only its presence is checked
          { path: "AppxManifest.xml" },
        ],
        missingLists: [],
      });
    });

    it("has empty ids without the manifest and the game config", async () => {
      const contentPath = await writePackageAsync("Game", GAME_CONTENT_ID, {
        expected: [{ path: "a.txt", size: 1 }],
      });

      const build = await readXboxBuildAsync(contentPath);

      expect(build.buildId).toBe("");
      expect(build.productId).toBe("");
    });

    it("takes the update's file list when it's of the installed build", async () => {
      const contentPath = await writePackageAsync("Game", GAME_CONTENT_ID, {
        build: buildId(2),
        metadata: [
          { name: `${GAME_CONTENT_ID.toLowerCase()}.smd`, build: buildId(1) },
          { name: `${GAME_CONTENT_ID}-update.smd`, build: buildId(2) },
        ],
        expected: [{ path: "updated.txt", size: 5 }],
      });

      expect((await readXboxBuildAsync(contentPath)).files).toEqual([
        { path: "updated.txt", size: 5 },
      ]);
    });

    it("throws when no file list is of the installed build", async () => {
      const contentPath = await writePackageAsync("Game", GAME_CONTENT_ID, {
        build: buildId(3),
        metadata: [{ name: `${GAME_CONTENT_ID}.smd`, build: buildId(1) }],
        expected: [],
      });

      await expect(readXboxBuildAsync(contentPath)).rejects.toThrow(
        "of another build than the installed one",
      );
    });

    it("throws without the file list", async () => {
      const contentPath = await writePackageAsync("Game", GAME_CONTENT_ID, {
        metadata: [],
        expected: [],
      });

      await expect(readXboxBuildAsync(contentPath)).rejects.toThrow(
        "file list wasn't found",
      );
    });

    it("reads the package through a junction to its Content, like the WindowsApps one Vortex may be given", async () => {
      const contentPath = await writePackageAsync("Game", GAME_CONTENT_ID, {
        expected: [{ path: "a.txt", size: 1 }],
        files: { "a.txt": 1 },
      });
      const linkPath = path.join(root, "WindowsApps", "Game_1.0.51.0_x64");
      await fs.mkdir(path.dirname(linkPath), { recursive: true });
      await fs.symlink(contentPath, linkPath, "junction");

      expect((await readXboxBuildAsync(linkPath)).files).toEqual([
        { path: "a.txt", size: 1 },
      ]);
      expect(
        await compareXboxPackageAsync(
          linkPath,
          [{ path: "a.txt", size: 1 }],
          undefined,
        ),
      ).toEqual({
        expectedFileCount: 1,
        extra: [],
        changed: [],
        missing: [],
      });
      // The game's own package is told apart from the DLCs by where the link leads
      expect(
        await compareXboxRelatedPackagesAsync(
          linkPath,
          [contentPath],
          undefined,
        ),
      ).toEqual([]);
    });

    it("throws when the container isn't one", async () => {
      const contentPath = await writePackageAsync("Game", GAME_CONTENT_ID, {
        expected: [],
      });
      await fs.writeFile(
        path.join(path.dirname(contentPath), GAME_CONTENT_ID),
        Buffer.alloc(0x400),
      );

      await expect(readXboxBuildAsync(contentPath)).rejects.toThrow(
        "isn't an Xbox package's container",
      );
    });
  });

  describe("readXboxProductIdAsync", () => {
    it("is undefined without the game config or its Store id", async () => {
      expect(await readXboxProductIdAsync(root)).toBe(undefined);

      await fs.writeFile(path.join(root, "MicrosoftGame.Config"), "<Game/>");

      expect(await readXboxProductIdAsync(root)).toBe(undefined);
    });
  });

  describe("compareXboxPackageAsync", () => {
    const expected = [
      { path: "same.txt", size: 3 },
      { path: "edited.txt", size: 3 },
      { path: "resized.txt", size: 3 },
      { path: "missing.txt", size: 3 },
    ];

    const writeContentAsync = (): Promise<string> =>
      writePackageAsync("Game", GAME_CONTENT_ID, {
        expected,
        files: {
          "same.txt": "abc",
          "edited.txt": "xyz",
          "resized.txt": "abcdef",
          "extra.txt": "e",
        },
      });

    it("compares by size and presence without the unmodified mark", async () => {
      const contentPath = await writeContentAsync();

      const result = await compareXboxPackageAsync(
        contentPath,
        expected,
        undefined,
      );

      expect(result.expectedFileCount).toBe(4);
      expect(result.changed).toEqual([
        { path: "resized.txt", size: 6, expectedSize: 3 },
      ]);
      expect(result.missing).toEqual([{ path: "missing.txt", size: 3 }]);
      expect(result.extra.map((file) => file.path)).toEqual(["extra.txt"]);
    });

    it("adds the files whose unmodified mark is gone though their size is right", async () => {
      const contentPath = await writeContentAsync();
      const isUnmodified = vi.fn((filePath: string) =>
        path.basename(filePath) === "edited.txt" ? false : true,
      );

      const result = await compareXboxPackageAsync(
        contentPath,
        expected,
        isUnmodified,
      );

      expect(result.changed).toEqual([
        { path: "resized.txt", size: 6, expectedSize: 3 },
        { path: "edited.txt", size: 3, expectedSize: 3 },
      ]);
      // Asked about the files on disk, by their path in the Content folder
      expect(isUnmodified).toHaveBeenCalledWith(
        path.join(await fs.realpath(contentPath), "edited.txt"),
      );
      expect(isUnmodified).toHaveBeenCalledWith(
        path.join(await fs.realpath(contentPath), "same.txt"),
      );
    });

    it("doesn't report a file twice, nor files of unknown size, extra files or unreadable marks", async () => {
      const contentPath = await writeContentAsync();
      const files = [...expected, { path: "nosize.txt" }];
      await fs.writeFile(path.join(contentPath, "nosize.txt"), "n");
      const isUnmodified = vi.fn((filePath: string) =>
        path.basename(filePath) === "same.txt" ? undefined : false,
      );

      const result = await compareXboxPackageAsync(
        contentPath,
        files,
        isUnmodified,
      );

      expect(result.changed.map((file) => file.path).sort()).toEqual([
        "edited.txt",
        "resized.txt",
      ]);
    });
  });

  describe("compareXboxRelatedPackagesAsync", () => {
    it("compares the DLC packages, skipping the game's own", async () => {
      const gameContent = await writePackageAsync("Game", GAME_CONTENT_ID, {
        expected: [{ path: "a.txt", size: 1 }],
      });
      const dlcContent = await writePackageAsync(
        "Game - War Sails",
        DLC_CONTENT_ID,
        {
          expected: [
            { path: "Modules\\NavalDLC\\SubModule.xml", size: 4 },
            { path: "Modules\\NavalDLC\\gone.xml", size: 2 },
          ],
          files: { "Modules/NavalDLC/SubModule.xml": 5, "stray.txt": 1 },
          appxManifest:
            "<Package><Properties><DisplayName> Bannerlord - War Sails &amp; Seas </DisplayName></Properties></Package>",
        },
      );

      const results = await compareXboxRelatedPackagesAsync(
        gameContent,
        [gameContent, path.join(root, "Gone", "Content"), dlcContent],
        undefined,
      );

      expect(results).toEqual([
        {
          name: "Bannerlord - War Sails & Seas",
          path: await fs.realpath(dlcContent),
          expectedFileCount: 2,
          changed: [
            {
              path: "Modules/NavalDLC/SubModule.xml",
              size: 5,
              expectedSize: 4,
            },
          ],
          missing: [{ path: "Modules/NavalDLC/gone.xml", size: 2 }],
        },
      ]);
    });

    it("names a package after its folder when the manifest's name is a resource", async () => {
      const gameContent = await writePackageAsync("Game", GAME_CONTENT_ID, {
        expected: [],
      });
      const dlcContent = await writePackageAsync(
        "Game - War Sails",
        DLC_CONTENT_ID,
        {
          expected: [],
          appxManifest:
            "<Package><DisplayName>ms-resource:DisplayName</DisplayName></Package>",
        },
      );

      const results = await compareXboxRelatedPackagesAsync(
        gameContent,
        [dlcContent],
        undefined,
      );

      expect(results.map((result) => result.name)).toEqual([
        "Game - War Sails",
      ]);
    });
  });
});

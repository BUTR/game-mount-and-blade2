import { appendFileSync, promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  layoutZip,
  readZipEntriesAsync,
  writeZipAsync,
} from "@bannerlord/zip/storedZip";
import {
  archiveFilesAsync,
  deleteArchiveAsync,
  getArchiveSpaceAsync,
  getArchivesPath,
  IFilesArchive,
  readArchivesAsync,
  renameArchiveAsync,
  restoreArchiveAsync,
} from "./archive";
import { getBuildVersionAsync } from "./buildVersions";
import { IVerifyFile, VerifyFileSource } from "./types";

const vortexPaths = vi.hoisted(() => ({ userData: "" }));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  util: { getVortexPath: () => vortexPaths.userData },
}));
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("winapi-bindings", () => ({}));
vi.mock("./buildVersions", () => ({
  getBuildVersionAsync: vi.fn(() => Promise.resolve(undefined)),
}));

const GAME_ID = "mountandblade2bannerlord";

const extra = (
  filePath: string,
  source: VerifyFileSource = "unknown",
): IVerifyFile => ({
  path: filePath,
  folder: "",
  status: "extra",
  source,
});

describe("files archives", () => {
  let root: string;
  let gamePath: string;
  let userData: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "verify-files-archive-"));
    gamePath = path.join(root, "Game");
    userData = path.join(root, "userData");
    await fs.mkdir(gamePath);
    vortexPaths.userData = userData;
  });

  afterEach(async () => {
    vi.mocked(getBuildVersionAsync).mockReset();
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeGameFileAsync = async (
    filePath: string,
    content: string | Buffer,
  ): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(gamePath, filePath)), {
      recursive: true,
    });
    await fs.writeFile(path.join(gamePath, filePath), content);
  };

  const existsAsync = (filePath: string): Promise<boolean> =>
    fs.access(filePath).then(
      () => true,
      () => false,
    );

  const readGameFileAsync = (filePath: string): Promise<string> =>
    fs.readFile(path.join(gamePath, filePath), "utf8");

  it("keeps the archives in Vortex's data of the game", () => {
    expect(getArchivesPath()).toBe(
      path.join(userData, GAME_ID, "verify-files"),
    );
  });

  describe("archiveFilesAsync", () => {
    it("moves the deletable files into an archive and lists them next to it", async () => {
      await writeGameFileAsync("Modules/Hand/SubModule.xml", "<Module/>");
      await writeGameFileAsync(
        "Modules/Hand/bin/Hand.dll",
        Buffer.alloc(3000, 7),
      );
      await writeGameFileAsync("vortex.deployment.json", "{}");
      await writeGameFileAsync("Modules/Deployed/SubModule.xml", "x");
      const progress: number[] = [];

      const { archive, kept } = await archiveFilesAsync(
        gamePath,
        "steam",
        "19012345",
        [
          extra("Modules/Hand/SubModule.xml", "manualMod"),
          extra("Modules/Hand/bin/Hand.dll", "manualMod"),
          extra("vortex.deployment.json", "vortexInternal"),
          extra("Modules/Deployed/SubModule.xml", "vortex"),
        ],
        {
          name: "  Before 1.3  ",
          version: "v1.2.12.98765",
          onProgress: (fraction) => progress.push(fraction),
        },
      );

      expect(kept).toEqual([]);
      expect(archive).toMatchObject({
        version: 1,
        name: "Before 1.3",
        store: "steam",
        buildId: "19012345",
        gameVersion: "v1.2.12.98765",
        files: [
          { path: "Modules/Hand/SubModule.xml", size: 9 },
          { path: "Modules/Hand/bin/Hand.dll", size: 3000 },
        ],
      });
      expect(path.dirname(archive.archivePath)).toBe(getArchivesPath());
      expect(path.basename(archive.archivePath)).toMatch(
        /^files-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.zip$/,
      );
      expect((await fs.stat(archive.archivePath)).size).toBe(archive.size);
      expect(
        (await readZipEntriesAsync(archive.archivePath)).map((entry) => [
          entry.name,
          entry.size,
        ]),
      ).toEqual([
        ["Modules/Hand/SubModule.xml", 9],
        ["Modules/Hand/bin/Hand.dll", 3000],
      ]);
      const manifest: unknown = JSON.parse(
        await fs.readFile(
          archive.archivePath.replace(/\.zip$/, ".json"),
          "utf8",
        ),
      );
      expect(manifest).toEqual({
        version: archive.version,
        name: archive.name,
        createdAt: archive.createdAt,
        store: archive.store,
        buildId: archive.buildId,
        gameVersion: archive.gameVersion,
        files: archive.files,
      });

      expect(await existsAsync(path.join(gamePath, "Modules", "Hand"))).toBe(
        false,
      );
      expect(
        await existsAsync(path.join(gamePath, "vortex.deployment.json")),
      ).toBe(true);
      expect(
        await existsAsync(
          path.join(gamePath, "Modules", "Deployed", "SubModule.xml"),
        ),
      ).toBe(true);
      expect(progress.at(-1)).toBe(1);
      expect(progress).toEqual([...progress].sort((lhs, rhs) => lhs - rhs));
      expect(await fs.readdir(getArchivesPath())).toHaveLength(2);
    });

    it("leaves out a blank name and an unknown version", async () => {
      await writeGameFileAsync("a.txt", "a");

      const { archive } = await archiveFilesAsync(
        gamePath,
        "gog",
        "5555",
        [extra("a.txt")],
        { name: "   " },
      );

      expect(archive).not.toHaveProperty("name");
      expect(archive).not.toHaveProperty("gameVersion");
    });

    it("keeps a file that changed after it was archived", async () => {
      await writeGameFileAsync("a.txt", "a");
      await writeGameFileAsync("b.txt", "b");

      const { kept } = await archiveFilesAsync(
        gamePath,
        "steam",
        "1",
        [extra("a.txt"), extra("b.txt")],
        {
          onProgress: (fraction) => {
            if (fraction === 1) {
              appendFileSync(path.join(gamePath, "b.txt"), "changed");
            }
          },
        },
      );

      expect(kept).toEqual(["b.txt"]);
      expect(await existsAsync(path.join(gamePath, "a.txt"))).toBe(false);
      expect(await readGameFileAsync("b.txt")).toBe("bchanged");
    });

    it("leaves the game folder and no archive behind when a file changes while it's archived", async () => {
      await writeGameFileAsync("a.txt", "a");
      await writeGameFileAsync("b.txt", "b");
      let grown = false;

      await expect(
        archiveFilesAsync(
          gamePath,
          "steam",
          "1",
          [extra("a.txt"), extra("b.txt")],
          {
            onProgress: () => {
              if (!grown) {
                grown = true;
                appendFileSync(path.join(gamePath, "b.txt"), "grown");
              }
            },
          },
        ),
      ).rejects.toThrow("'b.txt' grew while it was archived");

      expect(await readGameFileAsync("a.txt")).toBe("a");
      expect(await fs.readdir(getArchivesPath())).toEqual([]);
    });

    it("numbers an archive made within the same second as another, keeping both", async () => {
      await writeGameFileAsync("a.txt", "a");
      await writeGameFileAsync("b.txt", "b");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-26T10:00:00.200Z"));
      try {
        const first = await archiveFilesAsync(gamePath, "steam", "1", [
          extra("a.txt"),
        ]);
        vi.setSystemTime(new Date("2026-10-26T10:00:00.900Z"));
        const second = await archiveFilesAsync(gamePath, "steam", "1", [
          extra("b.txt"),
        ]);

        expect(path.basename(first.archive.archivePath)).toBe(
          "files-2026-10-26T10-00-00.zip",
        );
        expect(path.basename(second.archive.archivePath)).toBe(
          "files-2026-10-26T10-00-00-1.zip",
        );
      } finally {
        vi.useRealTimers();
      }

      expect(
        (await readArchivesAsync()).map((archive) =>
          archive.files.map((file) => file.path),
        ),
      ).toEqual([["b.txt"], ["a.txt"]]);
    });

    it("refuses to archive when the drive doesn't have the space, with a margin kept free", async () => {
      await writeGameFileAsync("a.txt", "a");
      const statfs = vi
        .spyOn(fs, "statfs")
        .mockResolvedValue({ bavail: 1, bsize: 4096 } as Awaited<
          ReturnType<typeof fs.statfs>
        >);
      try {
        await expect(
          archiveFilesAsync(gamePath, "steam", "1", [extra("a.txt")]),
        ).rejects.toThrow(
          /^Archiving requires 256\.0 MB of free space on the drive containing '.*', but only 4\.0 KB is available$/,
        );
      } finally {
        statfs.mockRestore();
      }

      expect(await readGameFileAsync("a.txt")).toBe("a");
      expect(await fs.readdir(getArchivesPath())).toEqual([]);
    });
  });

  describe("getArchiveSpaceAsync", () => {
    it("measures the archive of the files that can be archived, with the margin kept free", async () => {
      const statfs = vi
        .spyOn(fs, "statfs")
        .mockResolvedValue({ bavail: 1000, bsize: 4096 } as Awaited<
          ReturnType<typeof fs.statfs>
        >);
      try {
        const space = await getArchiveSpaceAsync([
          { ...extra("a.txt"), size: 10 },
          { ...extra("Modules/B/b.dll"), size: 20 },
          // Vortex's and changed files aren't archived
          { ...extra("c.txt", "vortex"), size: 1000 },
          { ...extra("d.txt"), status: "changed", size: 1000 },
        ]);

        const layout = layoutZip(
          [
            { name: "a.txt", size: 10 },
            { name: "Modules/B/b.dll", size: 20 },
          ].map((source) => ({ ...source, filePath: "", mtime: new Date(0) })),
        );
        expect(space).toEqual({
          required: layout.size + 256 * 1024 * 1024,
          free: 4096000,
          drive: path.parse(getArchivesPath()).root,
        });
        expect(statfs).toHaveBeenCalledWith(getArchivesPath());
      } finally {
        statfs.mockRestore();
      }
    });
  });

  describe("readArchivesAsync", () => {
    it("is empty before anything was archived", async () => {
      expect(await readArchivesAsync()).toEqual([]);
    });

    it("lists the archives newest first, removing what a crash left behind", async () => {
      const archivesPath = getArchivesPath();
      await fs.mkdir(archivesPath, { recursive: true });
      const writeArchiveAsync = async (
        name: string,
        manifest: Record<string, unknown> | undefined,
        size = 10,
      ): Promise<void> => {
        await fs.writeFile(
          path.join(archivesPath, `${name}.zip`),
          Buffer.alloc(size),
        );
        if (manifest !== undefined) {
          await fs.writeFile(
            path.join(archivesPath, `${name}.json`),
            JSON.stringify(manifest),
          );
        }
      };
      const manifest = (createdAt: string, extraFields = {}) => ({
        version: 1,
        createdAt,
        store: "steam",
        buildId: "15000000",
        files: [],
        ...extraFields,
      });
      await writeArchiveAsync(
        "older",
        manifest("2026-01-01T00:00:00.000Z", { gameVersion: "v1.0.0.1" }),
        5,
      );
      await writeArchiveAsync("newer", manifest("2026-06-01T00:00:00.000Z"), 7);
      await writeArchiveAsync("unlisted", undefined);
      await writeArchiveAsync("broken", undefined);
      await fs.writeFile(path.join(archivesPath, "broken.json"), "{ not json");
      await fs.writeFile(path.join(archivesPath, "crashed.zip.partial"), "x");
      await fs.writeFile(path.join(archivesPath, "notes.txt"), "x");
      vi.mocked(getBuildVersionAsync).mockResolvedValue("v1.2.12.98765");

      const archives = await readArchivesAsync();

      expect(archives).toEqual([
        {
          ...manifest("2026-06-01T00:00:00.000Z"),
          gameVersion: "v1.2.12.98765",
          archivePath: path.join(archivesPath, "newer.zip"),
          size: 7,
        },
        {
          ...manifest("2026-01-01T00:00:00.000Z"),
          gameVersion: "v1.0.0.1",
          archivePath: path.join(archivesPath, "older.zip"),
          size: 5,
        },
      ]);
      expect(getBuildVersionAsync).toHaveBeenCalledTimes(1);
      expect(getBuildVersionAsync).toHaveBeenCalledWith("steam", "15000000");
      expect(
        await existsAsync(path.join(archivesPath, "crashed.zip.partial")),
      ).toBe(false);
    });
  });

  describe("restoreArchiveAsync", () => {
    const archiveAsync = async (): Promise<IFilesArchive> => {
      await writeGameFileAsync("Modules/Hand/SubModule.xml", "<Module/>");
      await writeGameFileAsync("Modules/Hand/bin/Hand.dll", "dll");
      await writeGameFileAsync("readme.txt", "readme");
      const { archive } = await archiveFilesAsync(gamePath, "steam", "1", [
        extra("Modules/Hand/SubModule.xml"),
        extra("Modules/Hand/bin/Hand.dll"),
        extra("readme.txt"),
      ]);
      return archive;
    };

    it("puts the files back where they were", async () => {
      const archive = await archiveAsync();
      const progress: number[] = [];

      const result = await restoreArchiveAsync(gamePath, archive, {
        onProgress: (fraction) => progress.push(fraction),
      });

      expect(result).toEqual({ restored: 3, skipped: 0 });
      expect(await readGameFileAsync("Modules/Hand/SubModule.xml")).toBe(
        "<Module/>",
      );
      expect(await readGameFileAsync("Modules/Hand/bin/Hand.dll")).toBe("dll");
      expect(await readGameFileAsync("readme.txt")).toBe("readme");
      expect(progress.at(-1)).toBe(1);
      // The archive stays
      expect(await existsAsync(archive.archivePath)).toBe(true);
    });

    it("replaces what a crash left of a file being restored", async () => {
      const archive = await archiveAsync();
      await writeGameFileAsync("readme.txt.partial", "half");

      const result = await restoreArchiveAsync(gamePath, archive);

      expect(result).toEqual({ restored: 3, skipped: 0 });
      expect(await readGameFileAsync("readme.txt")).toBe("readme");
      expect(await existsAsync(path.join(gamePath, "readme.txt.partial"))).toBe(
        false,
      );
    });

    it("leaves the files the game folder has again as they are", async () => {
      const archive = await archiveAsync();
      await writeGameFileAsync("readme.txt", "new readme");

      const result = await restoreArchiveAsync(gamePath, archive);

      expect(result).toEqual({ restored: 2, skipped: 1 });
      expect(await readGameFileAsync("readme.txt")).toBe("new readme");
    });

    it("restores only the files asked for", async () => {
      const archive = await archiveAsync();

      const result = await restoreArchiveAsync(gamePath, archive, {
        only: new Set(["readme.txt"]),
      });

      expect(result).toEqual({ restored: 1, skipped: 0 });
      expect(await fs.readdir(gamePath)).toEqual(["readme.txt"]);
    });

    it("refuses a file outside of the game folder", async () => {
      const source = path.join(root, "evil.txt");
      await fs.writeFile(source, "evil");
      const layout = layoutZip([
        { name: "../evil.txt", filePath: source, size: 4, mtime: new Date() },
      ]);
      const archivePath = path.join(root, "evil.zip");
      const file = await fs.open(archivePath, "w");
      await file.truncate(layout.size);
      await file.close();
      await writeZipAsync(archivePath, layout);
      await fs.rm(source);

      await expect(
        restoreArchiveAsync(gamePath, {
          version: 1,
          createdAt: "",
          store: "steam",
          buildId: "1",
          files: [],
          archivePath,
          size: layout.size,
        }),
      ).rejects.toThrow("outside of the game folder");
      expect(await existsAsync(source)).toBe(false);
    });
  });

  describe("renaming and deleting", () => {
    it("names and unnames an archive in its list only", async () => {
      await writeGameFileAsync("a.txt", "a");
      const { archive } = await archiveFilesAsync(gamePath, "steam", "1", [
        extra("a.txt"),
      ]);
      const zip = await fs.readFile(archive.archivePath);

      await renameArchiveAsync(archive, "  Saved  ");
      expect((await readArchivesAsync())[0]?.name).toBe("Saved");

      await renameArchiveAsync(archive, " ");
      expect(await readArchivesAsync()).toEqual([
        expect.not.objectContaining({ name: expect.anything() as unknown }),
      ]);
      expect(await fs.readFile(archive.archivePath)).toEqual(zip);
      expect((await fs.readdir(getArchivesPath())).sort()).toEqual(
        [
          path.basename(archive.archivePath),
          path.basename(archive.archivePath).replace(/\.zip$/, ".json"),
        ].sort(),
      );
    });

    it("deletes the archive and its list", async () => {
      await writeGameFileAsync("a.txt", "a");
      const { archive } = await archiveFilesAsync(gamePath, "steam", "1", [
        extra("a.txt"),
      ]);

      await deleteArchiveAsync(archive);

      expect(await fs.readdir(getArchivesPath())).toEqual([]);
      expect(await readArchivesAsync()).toEqual([]);
    });
  });
});

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findSubModuleFilesAsync,
  getGameDocumentsPath,
  getModSettingsPath,
  readDirectoryEntriesAsync,
  readModuleFoldersAsync,
} from "./index";

describe("game layout on disk", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "game-layout-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeFileAsync = async (
    filePath: string,
    content = "",
  ): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, filePath)), {
      recursive: true,
    });
    await fs.writeFile(path.join(root, filePath), content);
  };

  describe("readDirectoryEntriesAsync", () => {
    it("tells files and folders apart", async () => {
      await writeFileAsync("folder/file.txt");
      await writeFileAsync("top.txt");

      const entries = await readDirectoryEntriesAsync(root);

      expect(
        entries.sort((lhs, rhs) => lhs.name.localeCompare(rhs.name)),
      ).toEqual([
        { name: "folder", isFile: false, isDirectory: true },
        { name: "top.txt", isFile: true, isDirectory: false },
      ]);
    });

    it("follows a linked folder to what it points to", async () => {
      await fs.mkdir(path.join(root, "target"));
      await fs.symlink(
        path.join(root, "target"),
        path.join(root, "link"),
        "junction",
      );

      const entries = await readDirectoryEntriesAsync(root);

      expect(entries.find((entry) => entry.name === "link")).toEqual({
        name: "link",
        isFile: false,
        isDirectory: true,
      });
    });

    it("reports a broken link as neither a file nor a folder", async () => {
      await fs.mkdir(path.join(root, "target"));
      await fs.symlink(
        path.join(root, "target"),
        path.join(root, "link"),
        "junction",
      );
      await fs.rm(path.join(root, "target"), { recursive: true });

      expect(await readDirectoryEntriesAsync(root)).toEqual([
        { name: "link", isFile: false, isDirectory: false },
      ]);
    });

    it("rejects for a folder that doesn't exist", async () => {
      await expect(
        readDirectoryEntriesAsync(path.join(root, "missing")),
      ).rejects.toThrow();
    });
  });

  describe("readModuleFoldersAsync", () => {
    it("lists the module folders, linked ones included, without files", async () => {
      await writeFileAsync("Modules/Native/SubModule.xml");
      await writeFileAsync("Modules/SandBox/SubModule.xml");
      await writeFileAsync("Modules/readme.txt");
      await writeFileAsync("Elsewhere/Bannerlord.Harmony/SubModule.xml");
      await fs.symlink(
        path.join(root, "Elsewhere", "Bannerlord.Harmony"),
        path.join(root, "Modules", "Bannerlord.Harmony"),
        "junction",
      );

      expect((await readModuleFoldersAsync(root)).sort()).toEqual([
        "Bannerlord.Harmony",
        "Native",
        "SandBox",
      ]);
    });

    it("is empty without a Modules folder", async () => {
      expect(await readModuleFoldersAsync(root)).toEqual([]);
    });
  });

  describe("findSubModuleFilesAsync", () => {
    it("finds SubModule.xml in any case down to the depth", async () => {
      await writeFileAsync("SubModule.xml");
      await writeFileAsync("A/submodule.XML");
      await writeFileAsync("A/B/SubModule.xml");
      await writeFileAsync("A/B/C/SubModule.xml");
      await writeFileAsync("A/other.xml");

      const found = (depth: number): Promise<string[]> =>
        findSubModuleFilesAsync(root, depth).then((files) =>
          files.map((file) => path.relative(root, file).replace(/\\/g, "/")),
        );

      expect(await found(0)).toEqual(["SubModule.xml"]);
      expect((await found(1)).sort()).toEqual([
        "A/submodule.XML",
        "SubModule.xml",
      ]);
      expect((await found(3)).sort()).toEqual([
        "A/B/C/SubModule.xml",
        "A/B/SubModule.xml",
        "A/submodule.XML",
        "SubModule.xml",
      ]);
    });

    it("doesn't take a folder named SubModule.xml for the file", async () => {
      await fs.mkdir(path.join(root, "SubModule.xml"));

      expect(await findSubModuleFilesAsync(root, 0)).toEqual([]);
    });

    it("is empty for a folder that doesn't exist", async () => {
      expect(
        await findSubModuleFilesAsync(path.join(root, "missing"), 2),
      ).toEqual([]);
    });
  });
});

describe("documents paths", () => {
  it("puts the game's folder and the mods' settings in Documents", () => {
    const documents = path.join("C:", "Users", "Player", "Documents");

    expect(getGameDocumentsPath(documents)).toBe(
      path.join(documents, "Mount and Blade II Bannerlord"),
    );
    expect(getModSettingsPath(documents)).toBe(
      path.join(
        documents,
        "Mount and Blade II Bannerlord",
        "Configs",
        "ModSettings",
      ),
    );
  });
});

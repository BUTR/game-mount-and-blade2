import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compareFiles,
  IActualFile,
  listGameFilesAsync,
  normalizePath,
} from "./compare";

const actual = (
  filePath: string,
  size: number,
  isLink = false,
): IActualFile => ({ path: filePath, size, isLink });

describe("normalizePath", () => {
  it("turns backslashes into slashes and trims separators at both ends", () => {
    expect(normalizePath("\\bin\\Win64_Shipping_Client\\")).toBe(
      "bin/Win64_Shipping_Client",
    );
    expect(normalizePath("//Modules/Native/SubModule.xml/")).toBe(
      "Modules/Native/SubModule.xml",
    );
  });

  it("keeps the case", () => {
    expect(normalizePath("Modules\\SandBox")).toBe("Modules/SandBox");
  });
});

describe("compareFiles", () => {
  it("finds nothing when the folder matches the build", () => {
    const result = compareFiles(
      [
        { path: "bin\\Bannerlord.exe", size: 100 },
        { path: "Modules\\Native\\SubModule.xml", size: 20 },
      ],
      [
        actual("bin\\Bannerlord.exe", 100),
        actual("Modules\\Native\\SubModule.xml", 20),
      ],
    );

    expect(result).toEqual({
      expectedFileCount: 2,
      extra: [],
      changed: [],
      missing: [],
    });
  });

  it("matches paths ignoring case and separators", () => {
    const result = compareFiles(
      [{ path: "Modules\\Native\\SubModule.xml", size: 20 }],
      [actual("modules/native/submodule.XML", 20)],
    );

    expect(result.extra).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("reports files not in the build as extra, with '/' separators", () => {
    const result = compareFiles(
      [],
      [actual("Modules\\MyMod\\SubModule.xml", 5, true)],
    );

    expect(result.extra).toEqual([
      { path: "Modules/MyMod/SubModule.xml", size: 5, isLink: true },
    ]);
  });

  it("reports a file of another size as changed, with the expected size", () => {
    const result = compareFiles(
      [{ path: "bin\\TaleWorlds.Library.dll", size: 1000 }],
      [actual("bin\\TaleWorlds.Library.dll", 1200)],
    );

    expect(result.changed).toEqual([
      { path: "bin/TaleWorlds.Library.dll", size: 1200, expectedSize: 1000 },
    ]);
    expect(result.missing).toEqual([]);
  });

  it("reports files of the build not in the folder as missing, with their normalized path and size", () => {
    const result = compareFiles(
      [{ path: "bin\\Bannerlord.exe", size: 100 }, { path: "bin\\user.cfg" }],
      [],
    );

    expect(result.missing).toEqual([
      { path: "bin/Bannerlord.exe", size: 100 },
      { path: "bin/user.cfg" },
    ]);
  });

  it("does not compare the size of a file whose size the store doesn't tell", () => {
    const result = compareFiles(
      [{ path: "bin\\user.cfg" }],
      [actual("bin\\user.cfg", 12345)],
    );

    expect(result.changed).toEqual([]);
  });

  it("does not compare the size of a link, its size is the link's", () => {
    const result = compareFiles(
      [{ path: "Modules\\Native\\SubModule.xml", size: 2000 }],
      [actual("Modules\\Native\\SubModule.xml", 0, true)],
    );

    expect(result.changed).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("accepts either size of a path several lists have, like a DLC overriding a base file", () => {
    const expected = [
      { path: "Modules\\Native\\a.xml", size: 10 },
      { path: "modules/native/A.xml", size: 20 },
    ];

    expect(
      compareFiles(expected, [actual("Modules/Native/a.xml", 10)]),
    ).toEqual(expect.objectContaining({ expectedFileCount: 1, changed: [] }));
    expect(
      compareFiles(expected, [actual("Modules/Native/a.xml", 20)]),
    ).toEqual(expect.objectContaining({ changed: [] }));
    expect(
      compareFiles(expected, [actual("Modules/Native/a.xml", 30)]).changed,
    ).toEqual([{ path: "Modules/Native/a.xml", size: 30, expectedSize: 10 }]);
  });

  it("stops comparing the size of a path once any of its lists doesn't tell it", () => {
    const expected = [
      { path: "bin\\config.xml", size: 10 },
      { path: "bin\\config.xml" },
      { path: "bin\\config.xml", size: 20 },
    ];

    expect(
      compareFiles(expected, [actual("bin/config.xml", 99)]).changed,
    ).toEqual([]);
    expect(compareFiles(expected, []).missing).toEqual([
      { path: "bin/config.xml" },
    ]);
  });
});

describe("listGameFilesAsync", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-compare-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("lists the files of every folder with their size, relative to the game folder", async () => {
    await fs.mkdir(path.join(root, "bin", "Win64_Shipping_Client"), {
      recursive: true,
    });
    await fs.mkdir(path.join(root, "Modules", "Empty"), { recursive: true });
    await fs.writeFile(path.join(root, "readme.txt"), "abc");
    await fs.writeFile(
      path.join(root, "bin", "Win64_Shipping_Client", "Bannerlord.exe"),
      Buffer.alloc(1500),
    );
    await fs.writeFile(path.join(root, ".hidden"), "");

    const files = await listGameFilesAsync(root);

    expect(
      files
        .map((file) => ({ ...file, path: normalizePath(file.path) }))
        .sort((lhs, rhs) => lhs.path.localeCompare(rhs.path)),
    ).toEqual([
      { path: ".hidden", size: 0, isLink: false },
      {
        path: "bin/Win64_Shipping_Client/Bannerlord.exe",
        size: 1500,
        isLink: false,
      },
      { path: "readme.txt", size: 3, isLink: false },
    ]);
  });

  it("lists a linked folder as a link without walking into it", async () => {
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "store-builds-outside-"),
    );
    try {
      await fs.writeFile(path.join(outside, "inside.txt"), "x");
      await fs.mkdir(path.join(root, "Modules"));
      await fs.symlink(
        outside,
        path.join(root, "Modules", "Linked"),
        "junction",
      );

      const files = await listGameFilesAsync(root);

      expect(files.map((file) => normalizePath(file.path))).toEqual([
        "Modules/Linked",
      ]);
      expect(files[0]?.isLink).toBe(true);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

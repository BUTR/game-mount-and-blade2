import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { deflateRawSync } from "zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseAppManifest,
  parseDepotManifestAsync,
  parseKeyValues,
  parseLibraryFolders,
  readSteamBuildAsync,
} from "./steam";

// ============================================================================
// Depot manifest builders
// ============================================================================

const PAYLOAD_MAGIC = 0x71f617d0;
const METADATA_MAGIC = 0x1f4812be;
const SIGNATURE_MAGIC = 0x1b81b817;
const END_MAGIC = 0x32c415ab;

const varint = (value: number): Buffer => {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
};

const varintField = (field: number, value: number): Buffer =>
  Buffer.concat([varint(field * 8), varint(value)]);

const bytesField = (field: number, data: Buffer | string): Buffer => {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes]);
};

const fixed32Field = (field: number, value: number): Buffer => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return Buffer.concat([varint(field * 8 + 5), data]);
};

const fileMapping = (filePath: string, size: number, flags = 0): Buffer =>
  Buffer.concat([
    bytesField(1, filePath),
    varintField(2, size),
    varintField(3, flags),
    // The SHA of the file name and content, skipped
    bytesField(4, Buffer.alloc(20, 1)),
    fixed32Field(6, 0xdeadbeef),
  ]);

const section = (magic: number, body: Buffer): Buffer => {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(magic, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
};

const endMarker = (): Buffer => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(END_MAGIC);
  return data;
};

const depotManifest = (
  files: { path: string; size: number; flags?: number }[],
  options: { filenamesEncrypted?: boolean } = {},
): Buffer =>
  Buffer.concat([
    section(
      PAYLOAD_MAGIC,
      Buffer.concat(
        files.map((file) =>
          bytesField(1, fileMapping(file.path, file.size, file.flags ?? 0)),
        ),
      ),
    ),
    section(
      METADATA_MAGIC,
      Buffer.concat([
        varintField(1, 261551),
        varintField(4, options.filenamesEncrypted === true ? 1 : 0),
      ]),
    ),
    section(SIGNATURE_MAGIC, bytesField(1, Buffer.alloc(128))),
    endMarker(),
  ]);

/**
 * A zip of one deflated file, as DepotDownloader stores the CDN's manifests
 */
const zipOneFile = (name: string, content: Buffer): Buffer => {
  const nameBytes = Buffer.from(name, "utf8");
  const compressed = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, end]);
};

// ============================================================================
// KeyValues
// ============================================================================

const APP_MANIFEST = `"AppState"
{
	"appid"		"261550"
	"Universe"		"1"
	"name"		"Mount & Blade II: Bannerlord"
	"StateFlags"		"4"
	"installdir"		"Mount & Blade II Bannerlord"
	"buildid"		"19012345"
	"InstalledDepots"
	{
		"261551"
		{
			"manifest"		"1234567890123456789"
			"size"		"60000000000"
		}
		"261552"
		{
			"manifest"		"987654321"
			"size"		"100"
			"dlcappid"		"261553"
		}
	}
	"UserConfig"
	{
		"language"		"english"
	}
}
`;

describe("parseKeyValues", () => {
  it("reads nested blocks and lowercases the keys", () => {
    expect(
      parseKeyValues('"Root" { "Key" "Value" "Child" { "A" "1" } }'),
    ).toEqual({ root: { key: "Value", child: { a: "1" } } });
  });

  it("keeps the case of values", () => {
    expect(parseKeyValues('"k" "Mount & Blade II Bannerlord"')).toEqual({
      k: "Mount & Blade II Bannerlord",
    });
  });

  it("skips line comments", () => {
    expect(
      parseKeyValues('// header\n"a" "1" // trailing\n// last line'),
    ).toEqual({ a: "1" });
  });

  it("unescapes quotes, backslashes, newlines and tabs in quoted tokens", () => {
    expect(
      parseKeyValues(String.raw`"path" "C:\\Games\\\"Steam\"" "t" "a\tb\nc"`),
    ).toEqual({ path: 'C:\\Games\\"Steam"', t: "a\tb\nc" });
  });

  it("reads unquoted tokens up to whitespace, braces or quotes", () => {
    expect(parseKeyValues('root{key value other"x"}')).toEqual({
      root: { key: "value", other: "x" },
    });
  });

  it("lets a later key replace an earlier one", () => {
    expect(parseKeyValues('"a" "1" "A" "2"')).toEqual({ a: "2" });
  });

  it("throws on a block that isn't closed", () => {
    expect(() => parseKeyValues('"root" { "a" "1"')).toThrow("Unexpected end");
  });

  it("throws on a key without a value", () => {
    expect(() => parseKeyValues('"a" "1" "b"')).toThrow("'b'");
  });

  it("reads an empty text as an empty block", () => {
    expect(parseKeyValues("  \n\t")).toEqual({});
  });
});

describe("parseAppManifest", () => {
  it("reads the app, its build, its folder and its installed depots", () => {
    expect(parseAppManifest(APP_MANIFEST)).toEqual({
      appId: "261550",
      buildId: "19012345",
      installDir: "Mount & Blade II Bannerlord",
      depots: [
        { depotId: "261551", manifestId: "1234567890123456789" },
        { depotId: "261552", manifestId: "987654321" },
      ],
    });
  });

  it("skips depots without a manifest", () => {
    const manifest = parseAppManifest(
      '"AppState" { "appid" "1" "installdir" "Game" "InstalledDepots" { "2" { "size" "5" } "3" "flat" } }',
    );

    expect(manifest?.depots).toEqual([]);
  });

  it("reads a manifest without depots or a build", () => {
    expect(
      parseAppManifest('"AppState" { "appid" "1" "installdir" "Game" }'),
    ).toEqual({ appId: "1", buildId: "", installDir: "Game", depots: [] });
  });

  it("is undefined without the app id or the install folder", () => {
    expect(parseAppManifest('"AppState" { "installdir" "Game" }')).toBe(
      undefined,
    );
    expect(parseAppManifest('"AppState" { "appid" "1" }')).toBe(undefined);
    expect(
      parseAppManifest('"AppState" { "appid" "1" "installdir" { } }'),
    ).toBe(undefined);
  });

  it("is undefined for another KeyValues file", () => {
    expect(parseAppManifest('"libraryfolders" { }')).toBe(undefined);
    expect(parseAppManifest('"AppState" "flat"')).toBe(undefined);
  });
});

describe("parseLibraryFolders", () => {
  it("reads the path of each library block", () => {
    const text = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
		"apps" { "228980" "1" }
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
	}
}`;

    expect(parseLibraryFolders(text)).toEqual([
      "C:\\Program Files (x86)\\Steam",
      "D:\\SteamLibrary",
    ]);
  });

  it("reads the older format of the path alone, skipping the other keys", () => {
    const text = `"LibraryFolders"
{
	"TimeNextStatsReport"		"1600000000"
	"ContentStatsID"		"-123"
	"1"		"D:\\\\SteamLibrary"
	"2"		""
}`;

    expect(parseLibraryFolders(text)).toEqual(["D:\\SteamLibrary"]);
  });

  it("is empty without the libraries block", () => {
    expect(parseLibraryFolders('"other" { "1" "x" }')).toEqual([]);
  });
});

// ============================================================================
// Depot manifests
// ============================================================================

describe("parseDepotManifestAsync", () => {
  it("reads the files with their size and flags", async () => {
    const files = await parseDepotManifestAsync(
      depotManifest([
        { path: "bin\\Win64_Shipping_Client\\Bannerlord.exe", size: 1234567 },
        { path: "bin\\Win64_Shipping_Client", size: 0, flags: 64 },
        { path: "Modules\\Native\\big.tpac", size: 2 ** 33 + 5 },
      ]),
    );

    expect(files).toEqual([
      {
        path: "bin\\Win64_Shipping_Client\\Bannerlord.exe",
        size: 1234567,
        flags: 0,
      },
      { path: "bin\\Win64_Shipping_Client", size: 0, flags: 64 },
      { path: "Modules\\Native\\big.tpac", size: 2 ** 33 + 5, flags: 0 },
    ]);
  });

  it("drops the zeros Steam pads file names with", async () => {
    const files = await parseDepotManifestAsync(
      depotManifest([{ path: "readme.txt\0\0", size: 1 }]),
    );

    expect(files[0]?.path).toBe("readme.txt");
  });

  it("reads a zipped manifest as DepotDownloader stores it", async () => {
    const files = await parseDepotManifestAsync(
      zipOneFile("z", depotManifest([{ path: "a.txt", size: 7 }])),
    );

    expect(files).toEqual([{ path: "a.txt", size: 7, flags: 0 }]);
  });

  it("reads a manifest without the end marker", async () => {
    const data = depotManifest([{ path: "a.txt", size: 7 }]);

    const files = await parseDepotManifestAsync(data.subarray(0, -4));

    expect(files).toHaveLength(1);
  });

  it("throws when the file names are encrypted", async () => {
    await expect(
      parseDepotManifestAsync(
        depotManifest([{ path: "garbage==", size: 1 }], {
          filenamesEncrypted: true,
        }),
      ),
    ).rejects.toThrow("encrypted");
  });

  it("throws on an unknown section", async () => {
    await expect(
      parseDepotManifestAsync(section(0x12345678, Buffer.alloc(4))),
    ).rejects.toThrow("Unknown manifest section 0x12345678");
  });

  it("throws on a section longer than the file", async () => {
    const data = depotManifest([{ path: "a.txt", size: 7 }]);

    await expect(parseDepotManifestAsync(data.subarray(0, 20))).rejects.toThrow(
      "out of bounds",
    );
  });

  it("throws on a field longer than its section", async () => {
    const body = Buffer.concat([
      varint(1 * 8 + 2),
      varint(100),
      Buffer.alloc(3),
    ]);

    await expect(
      parseDepotManifestAsync(section(PAYLOAD_MAGIC, body)),
    ).rejects.toThrow("out of bounds");
  });

  it("throws on a wire type it can't skip", async () => {
    // Field 5 with the deprecated group wire type
    const body = Buffer.from([5 * 8 + 3]);

    await expect(
      parseDepotManifestAsync(section(PAYLOAD_MAGIC, body)),
    ).rejects.toThrow("Unsupported wire type 3");
  });
});

// ============================================================================
// The installed build
// ============================================================================

describe("readSteamBuildAsync", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-steam-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeLibraryAsync = async (
    library: string,
    options: { appManifest?: string; installDir?: string } = {},
  ): Promise<string> => {
    const installDir = options.installDir ?? "Mount & Blade II Bannerlord";
    const gamePath = path.join(library, "steamapps", "common", installDir);
    await fs.mkdir(gamePath, { recursive: true });
    await fs.writeFile(
      path.join(library, "steamapps", "appmanifest_261550.acf"),
      options.appManifest ?? APP_MANIFEST,
    );
    return gamePath;
  };

  const writeDepotAsync = async (
    depotCache: string,
    name: string,
    data: Buffer,
  ): Promise<void> => {
    await fs.mkdir(depotCache, { recursive: true });
    await fs.writeFile(path.join(depotCache, `${name}.manifest`), data);
  };

  it("reads the files of every installed depot from the depot cache", async () => {
    const steamPath = path.join(root, "Steam");
    const gamePath = await writeLibraryAsync(steamPath);
    await writeDepotAsync(
      path.join(steamPath, "depotcache"),
      "261551_1234567890123456789",
      depotManifest([
        { path: "bin\\Bannerlord.exe", size: 100 },
        { path: "bin", size: 0, flags: 64 },
        { path: "bin\\user.cfg", size: 50, flags: 1 },
        { path: "bin\\versioned.cfg", size: 50, flags: 2 },
        { path: "bin\\link", size: 0, flags: 512 },
      ]),
    );
    await writeDepotAsync(
      path.join(steamPath, "depotcache"),
      "261552_987654321",
      depotManifest([{ path: "Modules\\DLC\\SubModule.xml", size: 7 }]),
    );

    const build = await readSteamBuildAsync(gamePath, [steamPath]);

    expect(build).toEqual({
      buildId: "19012345",
      productId: "261550",
      files: [
        { path: "bin\\Bannerlord.exe", size: 100 },
        { path: "bin\\user.cfg" },
        { path: "bin\\versioned.cfg" },
        { path: "bin\\link" },
        { path: "Modules\\DLC\\SubModule.xml", size: 7 },
      ],
      missingLists: [],
    });
  });

  it("lists the depots whose manifest isn't cached as missing", async () => {
    const library = path.join(root, "Library");
    const gamePath = await writeLibraryAsync(library);
    // Older Steam versions kept the depot cache in each library
    await writeDepotAsync(
      path.join(library, "steamapps", "depotcache"),
      "261551_1234567890123456789",
      depotManifest([{ path: "a.txt", size: 1 }]),
    );

    const build = await readSteamBuildAsync(gamePath, []);

    expect(build.files).toEqual([{ path: "a.txt", size: 1 }]);
    expect(build.missingLists).toEqual(["261552"]);
  });

  it.each(["steamapps", "config"])(
    "finds the library through the list in Steam's %s folder when the game folder isn't under its library",
    async (listFolder) => {
      // The library's install folder is a junction to where the game really is, Vortex knows the real folder.
      // Nothing above it is named common, only the library list can lead to the app manifest
      const steamPath = path.join(root, "Steam");
      const library = path.join(root, "Other Library");
      const gamePath = path.join(root, "Games", "Bannerlord");
      await fs.mkdir(gamePath, { recursive: true });
      await fs.mkdir(path.join(library, "steamapps", "common"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(library, "steamapps", "appmanifest_261550.acf"),
        APP_MANIFEST,
      );
      await fs.symlink(
        gamePath,
        path.join(
          library,
          "steamapps",
          "common",
          "Mount & Blade II Bannerlord",
        ),
        "junction",
      );
      await fs.mkdir(path.join(steamPath, listFolder), { recursive: true });
      await fs.writeFile(
        path.join(steamPath, listFolder, "libraryfolders.vdf"),
        `"libraryfolders" { "0" { "path" "${steamPath.replace(/\\/g, "\\\\")}" } "1" { "path" "${library.replace(/\\/g, "\\\\")}" } }`,
      );
      await writeDepotAsync(
        path.join(steamPath, "depotcache"),
        "261551_1234567890123456789",
        depotManifest([{ path: "a.txt", size: 1 }]),
      );

      await expect(readSteamBuildAsync(gamePath, [])).rejects.toThrow(
        "isn't in a Steam library",
      );

      const build = await readSteamBuildAsync(gamePath, [steamPath]);

      expect(build.productId).toBe("261550");
      expect(build.files).toEqual([{ path: "a.txt", size: 1 }]);
      expect(build.missingLists).toEqual(["261552"]);
    },
  );

  it("finds the library of a junctioned game folder by the layout it points into", async () => {
    const library = path.join(root, "Other Library");
    const realGamePath = await writeLibraryAsync(library);
    const linkedGamePath = path.join(root, "Game");
    await fs.symlink(realGamePath, linkedGamePath, "junction");

    const build = await readSteamBuildAsync(linkedGamePath, []);

    expect(build.productId).toBe("261550");
    expect(build.missingLists).toEqual(["261551", "261552"]);
  });

  it("ignores a broken library list, the game's own library is still found by its layout", async () => {
    const steamPath = path.join(root, "Steam");
    const gamePath = await writeLibraryAsync(path.join(root, "Library"));
    await fs.mkdir(path.join(steamPath, "steamapps"), { recursive: true });
    await fs.writeFile(
      path.join(steamPath, "steamapps", "libraryfolders.vdf"),
      '"libraryfolders" { "0" { "path" ',
    );

    const build = await readSteamBuildAsync(gamePath, [steamPath]);

    expect(build.productId).toBe("261550");
  });

  it("skips another app's broken manifest and manifests of other folders", async () => {
    const library = path.join(root, "Library");
    const gamePath = await writeLibraryAsync(library);
    await fs.writeFile(
      path.join(library, "steamapps", "appmanifest_1.acf"),
      '"AppState" { "appid" ',
    );
    await fs.writeFile(
      path.join(library, "steamapps", "appmanifest_2.acf"),
      '"AppState" { "appid" "2" "installdir" "Other Game" "buildid" "5" }',
    );

    const build = await readSteamBuildAsync(gamePath, []);

    expect(build.productId).toBe("261550");
  });

  it("throws when no library has the game's app manifest", async () => {
    const library = path.join(root, "Library");
    const gamePath = await writeLibraryAsync(library, {
      appManifest:
        '"AppState" { "appid" "2" "installdir" "Other Game" "buildid" "5" }',
    });

    await expect(readSteamBuildAsync(gamePath, [])).rejects.toThrow(
      "app manifest of the game wasn't found",
    );
  });

  it("throws when the game isn't in a Steam library and no Steam is known", async () => {
    const gamePath = path.join(root, "Games", "Bannerlord");
    await fs.mkdir(gamePath, { recursive: true });

    await expect(readSteamBuildAsync(gamePath, [])).rejects.toThrow(
      "isn't in a Steam library",
    );
  });
});

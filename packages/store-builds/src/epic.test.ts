import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { deflateSync } from "zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEpicManifestAsync, readEpicBuildAsync } from "./epic";

const MANIFEST_MAGIC = 0x44bec00c;

const u8 = (value: number): Buffer => Buffer.from([value]);

const u32 = (value: number): Buffer => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return data;
};

/**
 * Unreal's FString: ASCII as latin1, anything else as UTF-16 with a negative length
 */
const fstring = (text: string): Buffer => {
  if (text === "") {
    return u32(0);
  }
  if (/^[\x20-\x7e]*$/.test(text)) {
    return Buffer.concat([
      u32(text.length + 1),
      Buffer.from(`${text}\0`, "latin1"),
    ]);
  }
  const length = Buffer.alloc(4);
  length.writeInt32LE(-(text.length + 1));
  return Buffer.concat([length, Buffer.from(`${text}\0`, "utf16le")]);
};

interface IManifestFile {
  name: string;
  symlinkTarget?: string;
  tags?: string[];
  parts: number[];
}

const withSize = (body: Buffer): Buffer =>
  Buffer.concat([u32(body.length + 4), body]);

const manifestBody = (
  appName: string,
  buildVersion: string,
  files: IManifestFile[],
): Buffer => {
  const meta = withSize(
    Buffer.concat([
      u8(2),
      u32(18),
      u8(0),
      u32(0),
      fstring(appName),
      fstring(buildVersion),
      // Fields of newer versions, past what's read
      fstring("Bannerlord.exe"),
      fstring("-epicapp"),
    ]),
  );
  const chunks = withSize(Buffer.concat([u8(0), u32(1), Buffer.alloc(44)]));
  const fileList = Buffer.concat([
    u8(0),
    u32(files.length),
    ...files.map((file) => fstring(file.name)),
    ...files.map((file) => fstring(file.symlinkTarget ?? "")),
    Buffer.alloc(files.length * 20),
    Buffer.alloc(files.length),
    ...files.map((file) =>
      Buffer.concat([
        u32(file.tags?.length ?? 0),
        ...(file.tags ?? []).map(fstring),
      ]),
    ),
    ...files.map((file) =>
      Buffer.concat([
        u32(file.parts.length),
        ...file.parts.map((size) =>
          // A part of a newer version, longer than what's read
          Buffer.concat([u32(32), Buffer.alloc(16), u32(0), u32(size), u32(7)]),
        ),
      ]),
    ),
  ]);
  return Buffer.concat([meta, chunks, withSize(fileList)]);
};

const epicManifest = (
  files: IManifestFile[],
  options: {
    appName?: string;
    buildVersion?: string;
    compressed?: boolean;
    storedAs?: number;
  } = {},
): Buffer => {
  const body = manifestBody(
    options.appName ?? "Chickadee",
    options.buildVersion ?? "1.2.3.456789",
    files,
  );
  const compressed = options.compressed ?? true;
  const stored = compressed ? deflateSync(body) : body;
  const header = Buffer.alloc(41);
  header.writeUInt32LE(MANIFEST_MAGIC, 0);
  header.writeUInt32LE(header.length, 4);
  header.writeUInt32LE(body.length, 8);
  header.writeUInt32LE(stored.length, 12);
  header.writeUInt8(options.storedAs ?? (compressed ? 1 : 0), 36);
  header.writeUInt32LE(18, 37);
  return Buffer.concat([header, stored]);
};

describe("parseEpicManifestAsync", () => {
  it("reads the app, the build and each file with the sum of its chunk parts", async () => {
    const manifest = await parseEpicManifestAsync(
      epicManifest([
        { name: "bin/Win64_Shipping_Client/Bannerlord.exe", parts: [1000, 24] },
        { name: "Modules/Native/SubModule.xml", tags: ["core"], parts: [5] },
        { name: "empty.txt", parts: [] },
      ]),
    );

    expect(manifest).toEqual({
      appName: "Chickadee",
      buildVersion: "1.2.3.456789",
      files: [
        { path: "bin/Win64_Shipping_Client/Bannerlord.exe", size: 1024 },
        { path: "Modules/Native/SubModule.xml", size: 5 },
        { path: "empty.txt", size: 0 },
      ],
    });
  });

  it("reads a manifest stored uncompressed", async () => {
    const manifest = await parseEpicManifestAsync(
      epicManifest([{ name: "a.txt", parts: [3] }], { compressed: false }),
    );

    expect(manifest.files).toEqual([{ path: "a.txt", size: 3 }]);
  });

  it("reads UTF-16 names", async () => {
    const manifest = await parseEpicManifestAsync(
      epicManifest([{ name: "Modules/Ünïcode/ä.xml", parts: [1] }]),
    );

    expect(manifest.files[0]?.path).toBe("Modules/Ünïcode/ä.xml");
  });

  it("leaves out symbolic links", async () => {
    const manifest = await parseEpicManifestAsync(
      epicManifest([
        { name: "link", symlinkTarget: "target", parts: [] },
        { name: "target", parts: [9] },
      ]),
    );

    expect(manifest.files).toEqual([{ path: "target", size: 9 }]);
  });

  it("throws on data that isn't a manifest", async () => {
    await expect(parseEpicManifestAsync(Buffer.alloc(64))).rejects.toThrow(
      "Not an Epic build manifest",
    );
    await expect(
      parseEpicManifestAsync(epicManifest([]).subarray(0, 40)),
    ).rejects.toThrow("Not an Epic build manifest");
  });

  it("throws on an encrypted manifest", async () => {
    await expect(
      parseEpicManifestAsync(epicManifest([], { storedAs: 2 })),
    ).rejects.toThrow("encrypted");
  });

  it("throws on a manifest cut short", async () => {
    const data = epicManifest([{ name: "a.txt", parts: [3] }], {
      compressed: false,
    });

    await expect(
      parseEpicManifestAsync(data.subarray(0, data.length - 10)),
    ).rejects.toThrow("cut short");
  });
});

describe("readEpicBuildAsync", () => {
  let root: string;
  let gamePath: string;
  let epicDataPath: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "store-builds-epic-"));
    gamePath = path.join(root, "Game");
    epicDataPath = path.join(root, "EpicData");
    await fs.mkdir(path.join(gamePath, ".egstore"), { recursive: true });
    await fs.mkdir(path.join(epicDataPath, "Manifests"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeItemAsync = async (
    name: string,
    item: Record<string, unknown>,
  ): Promise<void> => {
    await fs.writeFile(
      path.join(epicDataPath, "Manifests", name),
      JSON.stringify(item),
    );
  };

  const writeManifestAsync = async (
    name: string,
    data: Buffer = epicManifest([{ name: "a.txt", parts: [3] }]),
  ): Promise<void> => {
    await fs.writeFile(path.join(gamePath, ".egstore", name), data);
  };

  it("reads the manifest the launcher's record names, with the catalog id and the version", async () => {
    await writeItemAsync("OTHER.item", {
      InstallLocation: path.join(root, "Other"),
      InstallationGuid: "OTHER",
    });
    await fs.writeFile(
      path.join(epicDataPath, "Manifests", "BROKEN.item"),
      "{ not json",
    );
    await writeItemAsync("GUID.item", {
      AppName: "Chickadee",
      AppVersionString: "1.2.3.456789",
      CatalogNamespace: "ns",
      CatalogItemId: "item",
      InstallLocation: `${gamePath}${path.sep}`,
      ManifestLocation: path.join(gamePath, ".egstore"),
      InstallationGuid: "GUID",
    });
    await writeManifestAsync(
      "GUID.manifest",
      epicManifest([{ name: "bin/Bannerlord.exe", parts: [10] }]),
    );
    await writeManifestAsync("STALE.manifest");

    const build = await readEpicBuildAsync(gamePath, epicDataPath);

    expect(build).toEqual({
      buildId: "1.2.3.456789",
      version: "v1.2.3.456789",
      productId: "ns:item:Chickadee",
      files: [{ path: "bin/Bannerlord.exe", size: 10 }],
      missingLists: [],
    });
  });

  it("reads the folder's only manifest without the launcher", async () => {
    await writeManifestAsync(
      "ANY.manifest",
      epicManifest([{ name: "a.txt", parts: [3] }], {
        appName: "Chickadee",
        buildVersion: "++Bannerlord+Release-CL-12345",
      }),
    );

    const build = await readEpicBuildAsync(gamePath, undefined);

    expect(build).toEqual({
      buildId: "++Bannerlord+Release-CL-12345",
      productId: "Chickadee",
      files: [{ path: "a.txt", size: 3 }],
      missingLists: [],
    });
  });

  it("reads the manifest from the folder the launcher's record names, when it isn't the game's .egstore", async () => {
    const manifestLocation = path.join(root, "Elsewhere", "Manifests");
    await fs.mkdir(manifestLocation, { recursive: true });
    await fs.writeFile(
      path.join(manifestLocation, "GUID.manifest"),
      epicManifest([{ name: "moved.txt", parts: [2] }]),
    );
    await writeManifestAsync("STALE.manifest");
    await writeItemAsync("GUID.item", {
      InstallLocation: gamePath,
      ManifestLocation: manifestLocation,
      InstallationGuid: "GUID",
    });

    const build = await readEpicBuildAsync(gamePath, epicDataPath);

    expect(build.files).toEqual([{ path: "moved.txt", size: 2 }]);
  });

  it("falls back to the folder's only manifest when the record's is gone", async () => {
    await writeItemAsync("GUID.item", {
      AppName: "Chickadee",
      InstallLocation: gamePath,
      InstallationGuid: "GUID",
    });
    await writeManifestAsync("OTHER.manifest");

    const build = await readEpicBuildAsync(gamePath, epicDataPath);

    expect(build.productId).toBe("Chickadee");
    expect(build.files).toEqual([{ path: "a.txt", size: 3 }]);
  });

  it("throws while the launcher's record says the install is incomplete", async () => {
    await writeItemAsync("GUID.item", {
      InstallLocation: gamePath,
      InstallationGuid: "GUID",
      bIsIncompleteInstall: true,
    });
    await writeManifestAsync("GUID.manifest");

    await expect(readEpicBuildAsync(gamePath, epicDataPath)).rejects.toThrow(
      "hasn't finished installing",
    );
  });

  it("throws while the launcher stages an install, without a manifest", async () => {
    await fs.mkdir(path.join(gamePath, ".egstore", "Pending"));

    await expect(readEpicBuildAsync(gamePath, undefined)).rejects.toThrow(
      "hasn't finished installing",
    );
  });

  it("throws when several manifests leave it unclear which is the install's", async () => {
    await writeManifestAsync("A.manifest");
    await writeManifestAsync("B.manifest");

    await expect(readEpicBuildAsync(gamePath, undefined)).rejects.toThrow(
      "manifest of the game wasn't found",
    );
  });

  it("throws without a manifest", async () => {
    await expect(readEpicBuildAsync(gamePath, epicDataPath)).rejects.toThrow(
      "manifest of the game wasn't found",
    );
  });
});

import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { inflate } from "zlib";
import { IExpectedFile, IStoreBuild } from "./types";
import { getPathExistsAsync } from "./fsUtils";

const inflateAsync = promisify(inflate);

const MANIFEST_MAGIC = 0x44bec00c;
const STORED_COMPRESSED = 0x1;
const STORED_ENCRYPTED = 0x2;
const EGSTORE_FOLDER = ".egstore";

/**
 * {InstallationGuid}.item, the Epic Games Launcher's record of an installed app
 */
interface IEpicInstall {
  AppName?: string;
  AppVersionString?: string;
  CatalogNamespace?: string;
  CatalogItemId?: string;
  InstallLocation?: string;
  ManifestLocation?: string;
  InstallationGuid?: string;
  bIsIncompleteInstall?: boolean;
}

const isSameFolder = (lhs: string, rhs: string): boolean =>
  path.relative(path.resolve(lhs), path.resolve(rhs)) === "";

/**
 * The launcher's record of the app installed in the folder, undefined without the launcher or for another folder
 */
const findInstallAsync = async (
  gamePath: string,
  epicDataPath: string | undefined,
): Promise<IEpicInstall | undefined> => {
  if (epicDataPath === undefined) {
    return undefined;
  }
  const manifestsPath = path.join(epicDataPath, "Manifests");
  const names = await fs.readdir(manifestsPath).catch((): string[] => []);
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".item")) {
      continue;
    }
    try {
      const install = JSON.parse(
        await fs.readFile(path.join(manifestsPath, name), "utf8"),
      ) as IEpicInstall;
      if (
        install.InstallLocation !== undefined &&
        isSameFolder(install.InstallLocation, gamePath)
      ) {
        return install;
      }
    } catch {
      // Another app's broken record
    }
  }
  return undefined;
};

class ManifestReader {
  public position = 0;

  public constructor(private readonly data: Buffer) {}

  public u8(): number {
    return this.data.readUInt8(this.advance(1));
  }

  public u32(): number {
    return this.data.readUInt32LE(this.advance(4));
  }

  public skip(length: number): void {
    this.advance(length);
  }

  /**
   * Unreal's FString: a signed length with the terminator, negative for UTF-16
   */
  public string(): string {
    const length = this.data.readInt32LE(this.advance(4));
    if (length === 0) {
      return "";
    }
    if (length < 0) {
      const start = this.advance(-length * 2);
      return this.data.toString("utf16le", start, start + (-length - 1) * 2);
    }
    const start = this.advance(length);
    return this.data.toString("latin1", start, start + length - 1);
  }

  private advance(length: number): number {
    const start = this.position;
    if (length < 0 || start + length > this.data.length) {
      throw new Error("The Epic manifest is cut short");
    }
    this.position += length;
    return start;
  }
}

export interface IEpicManifest {
  appName: string;
  buildVersion: string;
  files: { path: string; size: number }[];
}

/**
 * Epic's binary build manifest: a header, then the compressed data of the build's metadata, its chunks and its
 * files. A file's size is the sum of the chunk parts it's made of
 */
export const parseEpicManifestAsync = async (
  data: Buffer,
): Promise<IEpicManifest> => {
  if (data.length < 41 || data.readUInt32LE(0) !== MANIFEST_MAGIC) {
    throw new Error("Not an Epic build manifest");
  }
  const headerSize = data.readUInt32LE(4);
  const storedAs = data.readUInt8(36);
  if ((storedAs & STORED_ENCRYPTED) !== 0) {
    throw new Error("The Epic manifest is encrypted");
  }
  const stored = data.subarray(headerSize);
  const reader = new ManifestReader(
    (storedAs & STORED_COMPRESSED) !== 0 ? await inflateAsync(stored) : stored,
  );

  // Metadata
  const metaSize = reader.u32();
  reader.u8(); // data version
  reader.u32(); // feature level
  reader.u8(); // is file data
  reader.u32(); // app id
  const appName = reader.string();
  const buildVersion = reader.string();
  reader.position = metaSize;

  // Chunks, not needed
  const chunksStart = reader.position;
  reader.position = chunksStart + reader.u32();

  // Files, each field for all files in turn
  reader.u32(); // size
  reader.u8(); // version
  const count = reader.u32();
  const names = Array.from({ length: count }, () => reader.string());
  const symlinkTargets = Array.from({ length: count }, () => reader.string());
  reader.skip(count * 20); // SHA-1s
  reader.skip(count); // flags
  for (let file = 0; file < count; file++) {
    const tags = reader.u32();
    for (let tag = 0; tag < tags; tag++) {
      reader.string();
    }
  }
  const sizes = Array.from({ length: count }, () => {
    const parts = reader.u32();
    let size = 0;
    for (let part = 0; part < parts; part++) {
      const partStart = reader.position;
      const partSize = reader.u32();
      reader.skip(16 + 4); // chunk GUID, offset in the chunk
      size += reader.u32();
      reader.position = partStart + partSize;
    }
    return size;
  });

  return {
    appName,
    buildVersion,
    files: names
      .map((name, index) => ({ path: name, size: sizes[index]! }))
      .filter((_, index) => symlinkTargets[index] === ""),
  };
};

/**
 * The files of the build the Epic Games Launcher installed, from the build manifest it keeps in the game folder's
 * .egstore. Every file has its size. No network or login needed. The launcher's data folder is from getEpicDataPath,
 * its records tell which manifest is the install's
 */
export const readEpicBuildAsync = async (
  gamePath: string,
  epicDataPath: string | undefined,
): Promise<IStoreBuild> => {
  const install = await findInstallAsync(gamePath, epicDataPath);
  if (install?.bIsIncompleteInstall === true) {
    throw new Error(
      "The Epic Games Launcher hasn't finished installing the game",
    );
  }

  const egstorePath =
    install?.ManifestLocation ?? path.join(gamePath, EGSTORE_FOLDER);
  let manifestPath =
    install?.InstallationGuid !== undefined
      ? path.join(egstorePath, `${install.InstallationGuid}.manifest`)
      : undefined;
  if (manifestPath === undefined || !(await getPathExistsAsync(manifestPath))) {
    // Without the launcher's record, the folder's only manifest
    const manifests = (
      await fs.readdir(egstorePath).catch((): string[] => [])
    ).filter((name) => name.toLowerCase().endsWith(".manifest"));
    manifestPath =
      manifests.length === 1
        ? path.join(egstorePath, manifests[0]!)
        : undefined;
  }
  if (manifestPath === undefined) {
    if (await getPathExistsAsync(path.join(egstorePath, "Pending"))) {
      throw new Error(
        "The Epic Games Launcher hasn't finished installing the game",
      );
    }
    throw new Error(
      `The Epic Games Launcher's manifest of the game wasn't found in '${egstorePath}'`,
    );
  }

  const manifest = await parseEpicManifestAsync(
    await fs.readFile(manifestPath),
  );
  const files = manifest.files.map(
    (file): IExpectedFile => ({ path: file.path, size: file.size }),
  );
  const appName = install?.AppName ?? manifest.appName;
  const buildId = install?.AppVersionString ?? manifest.buildVersion;
  return {
    buildId,
    // The version with its changeset, as the game shows it
    ...(/^\d+(\.\d+){3}$/.test(buildId) ? { version: `v${buildId}` } : {}),
    productId:
      install?.CatalogNamespace !== undefined &&
      install.CatalogItemId !== undefined
        ? `${install.CatalogNamespace}:${install.CatalogItemId}:${appName}`
        : appName,
    files,
    missingLists: [],
  };
};

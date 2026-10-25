import { promises as fs } from "fs";
import os from "os";
import path from "path";
import * as winapi from "winapi-bindings";
import { IExpectedFile, IStoreBuild } from "./types";
import { isZip, readFirstZipEntry } from "./zip";
import { getPathExistsAsync } from "@bannerlord/core/utils";

const STEAMAPPS_FOLDER = "steamapps";
const COMMON_FOLDER = "common";
const DEPOT_CACHE_FOLDER = "depotcache";

// ============================================================================
// App manifest, steamapps/appmanifest_{appid}.acf
// ============================================================================

type KeyValues = { [key: string]: string | KeyValues };

/**
 * Valve's text KeyValues: quoted keys followed by a quoted value or a braced block. Keys are lowercased, Steam doesn't
 * keep their case
 */
export const parseKeyValues = (text: string): KeyValues => {
  let position = 0;

  // Braces are returned as tokens, undefined at the end of the text
  const readToken = (): string | undefined => {
    while (position < text.length) {
      if (/\s/.test(text[position]!)) {
        position++;
      } else if (text.startsWith("//", position)) {
        const end = text.indexOf("\n", position);
        position = end < 0 ? text.length : end;
      } else {
        break;
      }
    }
    if (position >= text.length) {
      return undefined;
    }

    const first = text[position]!;
    if (first === "{" || first === "}") {
      position++;
      return first;
    }

    let token = "";
    if (first === '"') {
      position++;
      while (position < text.length && text[position] !== '"') {
        if (text[position] === "\\" && position + 1 < text.length) {
          position++;
          const escaped = text[position]!;
          token += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else {
          token += text[position];
        }
        position++;
      }
      position++;
      return token;
    }

    while (position < text.length && !/[\s{}"]/.test(text[position]!)) {
      token += text[position++];
    }
    return token;
  };

  const readBlock = (isRoot: boolean): KeyValues => {
    const block: KeyValues = {};
    for (;;) {
      const key = readToken();
      if (key === undefined) {
        if (isRoot) {
          return block;
        }
        throw new Error("Unexpected end of the KeyValues text");
      }
      if (key === "}") {
        return block;
      }
      const value = readToken();
      if (value === undefined) {
        throw new Error(`No value for the key '${key}'`);
      }
      block[key.toLowerCase()] = value === "{" ? readBlock(false) : value;
    }
  };

  return readBlock(true);
};

export interface ISteamAppManifest {
  appId: string;
  buildId: string;
  installDir: string;
  depots: { depotId: string; manifestId: string }[];
}

export const parseAppManifest = (
  text: string,
): ISteamAppManifest | undefined => {
  const appState = parseKeyValues(text)["appstate"];
  if (typeof appState !== "object") {
    return undefined;
  }
  const { appid, buildid, installdir, installeddepots } = appState;
  if (typeof appid !== "string" || typeof installdir !== "string") {
    return undefined;
  }
  const depots =
    typeof installeddepots === "object"
      ? Object.entries(installeddepots).flatMap(([depotId, depot]) =>
          typeof depot === "object" && typeof depot["manifest"] === "string"
            ? [{ depotId, manifestId: depot["manifest"] }]
            : [],
        )
      : [];
  return {
    appId: appid,
    buildId: typeof buildid === "string" ? buildid : "",
    installDir: installdir,
    depots,
  };
};

// ============================================================================
// Depot manifest, depotcache/{depotid}_{manifestid}.manifest
// ============================================================================

const PAYLOAD_MAGIC = 0x71f617d0;
const METADATA_MAGIC = 0x1f4812be;
const SIGNATURE_MAGIC = 0x1b81b817;
const END_MAGIC = 0x32c415ab;

// EDepotFileFlag
const FLAG_USER_CONFIG = 1;
const FLAG_VERSIONED_USER_CONFIG = 2;
const FLAG_DIRECTORY = 64;
const FLAG_SYMLINK = 512;
// Files Steam expects the user or the game to change, it doesn't restore them on a verify either
const UNVERIFIED_FLAGS =
  FLAG_USER_CONFIG | FLAG_VERSIONED_USER_CONFIG | FLAG_SYMLINK;

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

export interface ISteamDepotFile {
  /**
   * Relative to the install folder, '\' separated
   */
  path: string;
  size: number;
  flags: number;
}

/**
 * Just the protobuf this needs: varints and length delimited fields, the others are skipped
 */
class ProtobufReader {
  private position: number;

  public constructor(
    private readonly data: Buffer,
    start: number,
    private readonly end: number,
  ) {
    this.position = start;
  }

  public next(): { field: number; wireType: number } | undefined {
    if (this.position >= this.end) {
      return undefined;
    }
    const key = this.readVarint();
    return { field: Math.floor(key / 8), wireType: key % 8 };
  }

  // Exact up to 2^53, sizes and flags are well below
  public readVarint(): number {
    let result = 0;
    for (let shift = 0; shift < 64; shift += 7) {
      if (this.position >= this.end) {
        throw new Error("The varint is out of bounds");
      }
      const byte = this.data[this.position++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
    }
    throw new Error("The varint is too long");
  }

  public readLengthDelimited(): { start: number; end: number } {
    const length = this.readVarint();
    const start = this.position;
    if (start + length > this.end) {
      throw new Error("The field is out of bounds");
    }
    this.position = start + length;
    return { start, end: this.position };
  }

  public skip(wireType: number): void {
    switch (wireType) {
      case WIRE_VARINT:
        this.readVarint();
        break;
      case WIRE_FIXED64:
        this.position += 8;
        break;
      case WIRE_LENGTH_DELIMITED:
        this.readLengthDelimited();
        break;
      case WIRE_FIXED32:
        this.position += 4;
        break;
      default:
        throw new Error(`Unsupported wire type ${wireType}`);
    }
    if (this.position > this.end) {
      throw new Error("The field is out of bounds");
    }
  }
}

// FileMapping { string filename = 1; uint64 size = 2; uint32 flags = 3; ... }
const readFileMapping = (
  data: Buffer,
  start: number,
  end: number,
): ISteamDepotFile => {
  const reader = new ProtobufReader(data, start, end);
  const file: ISteamDepotFile = { path: "", size: 0, flags: 0 };
  for (let key = reader.next(); key !== undefined; key = reader.next()) {
    if (key.field === 1 && key.wireType === WIRE_LENGTH_DELIMITED) {
      const range = reader.readLengthDelimited();
      file.path = data
        .toString("utf8", range.start, range.end)
        .replace(/\0+$/, "");
    } else if (key.field === 2 && key.wireType === WIRE_VARINT) {
      file.size = reader.readVarint();
    } else if (key.field === 3 && key.wireType === WIRE_VARINT) {
      file.flags = reader.readVarint();
    } else {
      reader.skip(key.wireType);
    }
  }
  return file;
};

/**
 * A depot manifest as Steam caches it: sections of a magic and a length followed by a protobuf message,
 * ContentManifestPayload, ContentManifestMetadata and ContentManifestSignature
 */
export const parseDepotManifest = (data: Buffer): ISteamDepotFile[] => {
  // Manifests from the CDN, as DepotDownloader stores them, are zipped
  if (isZip(data)) {
    data = readFirstZipEntry(data);
  }

  const files: ISteamDepotFile[] = [];
  let filenamesEncrypted = false;
  let position = 0;
  while (position + 4 <= data.length) {
    const magic = data.readUInt32LE(position);
    position += 4;
    if (magic === END_MAGIC) {
      break;
    }
    const length = data.readUInt32LE(position);
    position += 4;
    const end = position + length;
    if (end > data.length) {
      throw new Error("The manifest section is out of bounds");
    }

    const reader = new ProtobufReader(data, position, end);
    if (magic === PAYLOAD_MAGIC) {
      // ContentManifestPayload { repeated FileMapping mappings = 1; }
      for (let key = reader.next(); key !== undefined; key = reader.next()) {
        if (key.field === 1 && key.wireType === WIRE_LENGTH_DELIMITED) {
          const range = reader.readLengthDelimited();
          files.push(readFileMapping(data, range.start, range.end));
        } else {
          reader.skip(key.wireType);
        }
      }
    } else if (magic === METADATA_MAGIC) {
      // ContentManifestMetadata { ...; bool filenames_encrypted = 4; ... }
      for (let key = reader.next(); key !== undefined; key = reader.next()) {
        if (key.field === 4 && key.wireType === WIRE_VARINT) {
          filenamesEncrypted = reader.readVarint() !== 0;
        } else {
          reader.skip(key.wireType);
        }
      }
    } else if (magic !== SIGNATURE_MAGIC) {
      throw new Error(`Unknown manifest section 0x${magic.toString(16)}`);
    }
    position = end;
  }

  if (filenamesEncrypted) {
    throw new Error("The manifest file names are encrypted");
  }
  return files;
};

// ============================================================================
// The installed build
// ============================================================================

/**
 * Where Steam is installed, its depotcache has the manifests of games in the other libraries too. Vortex doesn't
 * tell extensions since 2.8
 */
const getSteamPaths = (): string[] => {
  if (process.platform === "win32") {
    const paths: string[] = [];
    const keys = [
      ["HKEY_CURRENT_USER", "Software\\Valve\\Steam", "SteamPath"],
      [
        "HKEY_LOCAL_MACHINE",
        "SOFTWARE\\WOW6432Node\\Valve\\Steam",
        "InstallPath",
      ],
    ] as const;
    for (const [hive, key, name] of keys) {
      try {
        const { value } = winapi.RegGetValue(hive, key, name);
        if (typeof value === "string") {
          paths.push(value);
        }
      } catch {
        // Not set
      }
    }
    return paths;
  }

  const home = os.homedir();
  return [
    path.join(home, ".steam", "steam"),
    path.join(home, ".local", "share", "Steam"),
    path.join(
      home,
      ".var",
      "app",
      "com.valvesoftware.Steam",
      ".local",
      "share",
      "Steam",
    ),
  ];
};

const findAppManifestAsync = async (
  steamAppsPath: string,
  installDir: string,
): Promise<ISteamAppManifest | undefined> => {
  const names = await fs.readdir(steamAppsPath);
  for (const name of names) {
    if (!/^appmanifest_\d+\.acf$/i.test(name)) {
      continue;
    }
    try {
      const manifest = parseAppManifest(
        await fs.readFile(path.join(steamAppsPath, name), "utf8"),
      );
      if (manifest?.installDir.toLowerCase() === installDir.toLowerCase()) {
        return manifest;
      }
    } catch {
      // Another app's broken manifest
    }
  }
  return undefined;
};

/**
 * The files of the build Steam installed into {library}/steamapps/common/{installdir}, read from the depot manifests
 * Steam keeps in its depotcache, older versions kept them in each library. No network or login needed
 */
export const readSteamBuildAsync = async (
  gamePath: string,
): Promise<IStoreBuild> => {
  const installPath = path.resolve(gamePath);
  const commonPath = path.dirname(installPath);
  const steamAppsPath = path.dirname(commonPath);
  if (
    path.basename(commonPath).toLowerCase() !== COMMON_FOLDER ||
    path.basename(steamAppsPath).toLowerCase() !== STEAMAPPS_FOLDER
  ) {
    throw new Error(`The game isn't in a Steam library: '${installPath}'`);
  }

  const appManifest = await findAppManifestAsync(
    steamAppsPath,
    path.basename(installPath),
  );
  if (appManifest === undefined) {
    throw new Error(
      `Steam's app manifest of the game wasn't found in '${steamAppsPath}'`,
    );
  }

  const depotCachePaths = [
    path.join(steamAppsPath, DEPOT_CACHE_FOLDER),
    path.join(path.dirname(steamAppsPath), DEPOT_CACHE_FOLDER),
    ...getSteamPaths().flatMap((steamPath) => [
      path.join(steamPath, DEPOT_CACHE_FOLDER),
      path.join(steamPath, STEAMAPPS_FOLDER, DEPOT_CACHE_FOLDER),
    ]),
  ];

  const files: IExpectedFile[] = [];
  const missingLists: string[] = [];
  for (const { depotId, manifestId } of appManifest.depots) {
    let manifestPath: string | undefined;
    for (const depotCachePath of depotCachePaths) {
      const candidate = path.join(
        depotCachePath,
        `${depotId}_${manifestId}.manifest`,
      );
      if (await getPathExistsAsync(candidate)) {
        manifestPath = candidate;
        break;
      }
    }
    if (manifestPath === undefined) {
      missingLists.push(depotId);
      continue;
    }
    for (const file of parseDepotManifest(await fs.readFile(manifestPath))) {
      if ((file.flags & FLAG_DIRECTORY) !== 0) {
        continue;
      }
      files.push(
        (file.flags & UNVERIFIED_FLAGS) !== 0
          ? { path: file.path }
          : { path: file.path, size: file.size },
      );
    }
  }

  return {
    buildId: appManifest.buildId,
    productId: appManifest.appId,
    files,
    missingLists,
  };
};

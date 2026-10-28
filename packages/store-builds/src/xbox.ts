import { promises as fs } from "fs";
import path from "path";
import {
  compareFiles,
  IActualFile,
  IChangedFile,
  ICompareResult,
  listGameFilesAsync,
  normalizePath,
} from "./compare";
import { IExpectedFile, IStoreBuild } from "./types";
import { IsUnmodified } from "./unmodified";

const SEGMENT_METADATA_MAGIC = " PFX";
// Gaming Services' driver reads versions before 5
const SEGMENT_METADATA_MAX_VERSION = 4;
const SEGMENT_METADATA_BUILD_ID_OFFSET = 0x18;
const RECORD_SIZE = 16;
// The package's container (XVD) is named after its content id, a GUID without an extension. Its header has the
// build id the segment metadata must have
const CONTAINER_NAME = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CONTAINER_MAGIC = "msft-xvd";
const CONTAINER_MAGIC_OFFSET = 0x200;
const CONTAINER_BUILD_ID_OFFSET = 0x3ac;
const BUILD_ID_SIZE = 16;
// Windows writes the installed package's identity into it, its size isn't the package's and it has no unmodified mark
const REWRITTEN_FILES = ["appxmanifest.xml"];

export interface IXboxSegmentMetadata {
  /**
   * As stored, compared to the container's
   */
  buildId: Buffer;
  files: { path: string; size: number }[];
}

/**
 * {content id}.smd, the segment metadata of an Xbox package (MSIXVC): a header, a record per file, then the files'
 * paths as UTF-16. A record has the path's length in characters and offset in the paths, and the file's size
 */
export const parseXboxSegmentMetadata = (
  data: Buffer,
): IXboxSegmentMetadata => {
  if (
    data.length < SEGMENT_METADATA_BUILD_ID_OFFSET + BUILD_ID_SIZE ||
    data.toString("latin1", 0, 4) !== SEGMENT_METADATA_MAGIC
  ) {
    throw new Error("Not an Xbox package's segment metadata");
  }
  // A newer format, like MSIXVC2's may be, is not guessed at
  if (data.readUInt32LE(4) > SEGMENT_METADATA_MAX_VERSION) {
    throw new Error(
      "The Xbox package's segment metadata uses an unsupported newer format",
    );
  }
  const headerSize = data.readUInt32LE(12);
  const count = data.readUInt32LE(16);
  const pathsStart = headerSize + count * RECORD_SIZE;
  if (pathsStart > data.length) {
    throw new Error("The Xbox package's segment metadata is cut short");
  }
  const files: { path: string; size: number }[] = [];
  for (let index = 0; index < count; index++) {
    const record = headerSize + index * RECORD_SIZE;
    const length = data.readUInt16LE(record + 2);
    const start = pathsStart + data.readUInt32LE(record + 4);
    const end = start + length * 2;
    if (end > data.length) {
      throw new Error("The Xbox package's segment metadata is cut short");
    }
    files.push({
      path: data.toString("utf16le", start, end),
      size: Number(data.readBigUInt64LE(record + 8)),
    });
  }
  return {
    buildId: Buffer.from(
      data.subarray(
        SEGMENT_METADATA_BUILD_ID_OFFSET,
        SEGMENT_METADATA_BUILD_ID_OFFSET + BUILD_ID_SIZE,
      ),
    ),
    files,
  };
};

const readTextAsync = (filePath: string): Promise<string | undefined> =>
  fs.readFile(filePath, "utf8").catch(() => undefined);

/**
 * The installed build's id from the package's container header
 */
const readContainerBuildIdAsync = async (
  containerPath: string,
): Promise<Buffer> => {
  const file = await fs.open(containerPath, "r");
  try {
    const header = Buffer.alloc(CONTAINER_BUILD_ID_OFFSET + BUILD_ID_SIZE);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (
      bytesRead < header.length ||
      header.toString(
        "latin1",
        CONTAINER_MAGIC_OFFSET,
        CONTAINER_MAGIC_OFFSET + CONTAINER_MAGIC.length,
      ) !== CONTAINER_MAGIC
    ) {
      throw new Error(`'${containerPath}' isn't an Xbox package's container`);
    }
    return header.subarray(CONTAINER_BUILD_ID_OFFSET);
  } finally {
    await file.close();
  }
};

/**
 * The files of the Xbox package whose Content is the folder, from its segment metadata next to it. Gaming Services
 * looks for the package's, then an update's. The one of the build the container has is taken
 */
const readPackageFilesAsync = async (
  contentPath: string,
): Promise<IExpectedFile[]> => {
  const packagePath = path.dirname(contentPath);
  const names = await fs.readdir(packagePath).catch((): string[] => []);
  const container = names.find((name) => CONTAINER_NAME.test(name));
  const metadataNames = [`${container}.smd`, `${container}-update.smd`]
    .map((wanted) =>
      names.find((name) => name.toLowerCase() === wanted.toLowerCase()),
    )
    .filter((name) => name !== undefined);
  if (container === undefined || metadataNames.length === 0) {
    throw new Error(
      `The Xbox package's file list wasn't found in '${packagePath}'`,
    );
  }

  const buildId = await readContainerBuildIdAsync(
    path.join(packagePath, container),
  );
  for (const name of metadataNames) {
    const metadata = parseXboxSegmentMetadata(
      await fs.readFile(path.join(packagePath, name)),
    );
    if (metadata.buildId.equals(buildId)) {
      return metadata.files.map((file) =>
        REWRITTEN_FILES.includes(file.path.toLowerCase())
          ? { path: file.path }
          : file,
      );
    }
  }
  throw new Error(
    `The Xbox package's file list in '${packagePath}' does not match the installed build. The Xbox app may ` +
      "be updating the game, or the installation is corrupted",
  );
};

/**
 * The Content folder itself, Vortex's game folder may be the package's junction in WindowsApps
 */
const resolveContentPathAsync = (contentPath: string): Promise<string> =>
  fs.realpath(contentPath).catch(() => path.resolve(contentPath));

/**
 * The files of the Xbox (Game Pass) package installed in the folder, Vortex's game folder being the package's
 * Content, from the segment metadata next to it. Every file has its size. No network or login needed. DLCs are
 * packages of their own, see compareXboxRelatedPackagesAsync
 */
export const readXboxBuildAsync = async (
  gamePath: string,
): Promise<IStoreBuild> => {
  const files = await readPackageFilesAsync(
    await resolveContentPathAsync(gamePath),
  );
  const manifest = await readTextAsync(path.join(gamePath, "appxmanifest.xml"));
  return {
    // The package's version, the game's comes from its files
    buildId:
      /<Identity\b[^>]*\bVersion="([^"]+)"/.exec(manifest ?? "")?.[1] ?? "",
    productId: (await readXboxProductIdAsync(gamePath)) ?? "",
    files,
    missingLists: [],
  };
};

/**
 * The game's Store id from its MicrosoftGame.Config, its DLCs are registered under it
 */
export const readXboxProductIdAsync = async (
  gamePath: string,
): Promise<string | undefined> =>
  /<StoreId>\s*([^<\s]+)\s*<\/StoreId>/.exec(
    (await readTextAsync(path.join(gamePath, "MicrosoftGame.Config"))) ?? "",
  )?.[1];

/**
 * The files of the package that are there with their size but that Gaming Services' unmodified mark says changed,
 * like an edit that kept the size or a copy put back. The ones whose size or presence is already off are left out
 */
const findModifiedFiles = (
  contentPath: string,
  expected: readonly IExpectedFile[],
  actual: readonly IActualFile[],
  comparison: ICompareResult,
  isUnmodified: IsUnmodified,
): IChangedFile[] => {
  const toKey = (filePath: string): string =>
    normalizePath(filePath).toLowerCase();
  const sizes = new Map(
    expected
      .filter((file) => file.size !== undefined)
      .map((file) => [toKey(file.path), file.size!]),
  );
  const changed = new Set(comparison.changed.map((file) => toKey(file.path)));
  const modified: IChangedFile[] = [];
  for (const file of actual) {
    const key = toKey(file.path);
    const size = sizes.get(key);
    if (
      size === undefined ||
      file.isLink ||
      changed.has(key) ||
      isUnmodified(path.join(contentPath, file.path)) !== false
    ) {
      continue;
    }
    modified.push({
      path: normalizePath(file.path),
      size: file.size,
      expectedSize: size,
    });
  }
  return modified;
};

/**
 * Compares the package's Content to its files, by size and presence and, when it can be read, by Gaming Services'
 * unmodified mark
 */
export const compareXboxPackageAsync = async (
  contentPath: string,
  files: readonly IExpectedFile[],
  isUnmodified: IsUnmodified | undefined,
): Promise<ICompareResult> => {
  const resolved = await resolveContentPathAsync(contentPath);
  const actual = await listGameFilesAsync(resolved);
  const comparison = compareFiles(files, actual);
  if (isUnmodified !== undefined) {
    comparison.changed.push(
      ...findModifiedFiles(resolved, files, actual, comparison, isUnmodified),
    );
  }
  return comparison;
};

/**
 * A package installed with the game, a DLC, compared to its files. Its folder's other files aren't listed, nothing
 * but Gaming Services puts files there
 */
export interface IXboxPackageComparison {
  /**
   * The package's display name, like "Mount & Blade II: Bannerlord - War Sails"
   */
  name: string;
  /**
   * The package's Content folder, its files' paths are relative to it
   */
  path: string;
  expectedFileCount: number;
  changed: IChangedFile[];
  missing: IExpectedFile[];
}

const decodeXml = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * Compares the packages installed with the game, its DLCs, to their files. Each is a package of its own, in a folder
 * next to the game's
 * @param packageRoots From getXboxRelatedPackageRoots, the game's own package is among them
 */
export const compareXboxRelatedPackagesAsync = async (
  gamePath: string,
  packageRoots: readonly string[],
  isUnmodified: IsUnmodified | undefined,
): Promise<IXboxPackageComparison[]> => {
  const gameContent = (await resolveContentPathAsync(gamePath)).toLowerCase();
  const results: IXboxPackageComparison[] = [];
  for (const root of packageRoots) {
    const contentPath = await fs.realpath(root).catch(() => undefined);
    if (
      contentPath === undefined ||
      contentPath.toLowerCase() === gameContent
    ) {
      continue;
    }
    const files = await readPackageFilesAsync(contentPath);
    const comparison = await compareXboxPackageAsync(
      contentPath,
      files,
      isUnmodified,
    );
    const manifest = await readTextAsync(
      path.join(contentPath, "appxmanifest.xml"),
    );
    const displayName = /<DisplayName>([^<]+)<\/DisplayName>/.exec(
      manifest ?? "",
    )?.[1];
    results.push({
      name:
        displayName !== undefined && !displayName.startsWith("ms-resource:")
          ? decodeXml(displayName.trim())
          : path.basename(path.dirname(contentPath)),
      path: contentPath,
      expectedFileCount: comparison.expectedFileCount,
      changed: comparison.changed,
      missing: comparison.missing,
    });
  }
  return results;
};

import { promises as fs } from "fs";
import { decompressLz4Block } from "./lz4";

/**
 * Parser for Bannerlord asset packages (.tpac), based on specifications from TpacTool
 * (https://github.com/szszss/TpacTool, MIT).
 */

const TPAC_MAGIC = 0x43415054;
const STORAGE_UNCOMPRESSED = 0;
const STORAGE_LZ4 = 1;
// Maximum allowable string length to guard against buffer misalignment when reading headers
const MAX_STRING_LENGTH = 65535;

export const TPAC_TEXTURE = "c974cbcb-5f1c-49f6-9a32-2b5b6c92c2e8";
export const TPAC_MATERIAL = "1db01393-6902-4f19-83ba-b37a39830717";
export const TPAC_METAMESH = "a08f8b97-197c-4bea-b95b-53846cae834e";
const TEXTURE_PIXELS = "70ee4e2c-79e4-4b2d-8d54-d53ecd2a559c";
const VERTEX_STREAM = "bb1df897-584f-4770-abf2-663fe449f247";

export interface ITpacSegment {
  offset: number;
  actualSize: number;
  storageSize: number;
  owner: string;
  type: string;
  storageFormat: number;
}

export interface ITpacItem {
  filePath: string;
  type: string;
  guid: string;
  version: number;
  name: string;
  metadata: Buffer;
  segments: ITpacSegment[];
}

/**
 * Texture formats the banner renderer can decode; any other format stored in the package maps to "unknown".
 */
export type TpacTextureFormat = "BC7" | "unknown";

export interface ITpacTexture {
  width: number;
  height: number;
  format: TpacTextureFormat;
  /**
   * Raw texture pixel data containing all mipmaps across all array slices in sequence.
   */
  pixels: Uint8Array;
}

export interface ITpacMesh {
  guid: string;
  lod: number;
  vertexCount: number;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface ITpacVertexStream {
  indices: number[];
  /**
   * Vertex color buffer (RGBA, four bytes per vertex).
   */
  colors: Uint8Array;
  /**
   * Vertex position buffer (XYZ, three 32-bit floats per vertex).
   */
  positions: Float32Array;
}

class Reader {
  public position = 0;

  constructor(private readonly buffer: Buffer) {}

  public u8 = (): number => this.buffer.readUInt8(this.advance(1));
  public u16 = (): number => this.buffer.readUInt16LE(this.advance(2));
  public u32 = (): number => this.buffer.readUInt32LE(this.advance(4));
  public i32 = (): number => this.buffer.readInt32LE(this.advance(4));
  public f32 = (): number => this.buffer.readFloatLE(this.advance(4));
  // Segment sizes and offsets in a package do not exceed Number.MAX_SAFE_INTEGER (2^53 - 1)
  public u64 = (): number =>
    Number(this.buffer.readBigUInt64LE(this.advance(8)));
  public skip = (count: number): void => {
    this.advance(count);
  };
  public bytes = (count: number): Buffer => {
    const start = this.advance(count);
    return this.buffer.subarray(start, start + count);
  };

  /**
   * Formats GUIDs matching .NET's `Guid(byte[])` layout (first three components are little-endian).
   */
  public guid = (): string => {
    const start = this.advance(16);
    const hex = (from: number, to: number, reverse: boolean): string => {
      const bytes = [...this.buffer.subarray(start + from, start + to)];
      return (reverse ? bytes.reverse() : bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    return [
      hex(0, 4, true),
      hex(4, 6, true),
      hex(6, 8, true),
      hex(8, 10, false),
      hex(10, 16, false),
    ].join("-");
  };

  public string = (): string => {
    const length = this.u32();
    if (length > MAX_STRING_LENGTH) {
      throw new Error(`Unexpected string length ${length}`);
    }
    const start = this.advance(length);
    return this.buffer.toString("utf8", start, start + length);
  };

  public stringList = (): string[] => {
    const count = this.u32();
    return Array.from({ length: count }, () => this.string());
  };

  private advance = (count: number): number => {
    const start = this.position;
    if (start + count > this.buffer.length) {
      throw new Error("Unexpected end of the package data");
    }
    this.position += count;
    return start;
  };
}

/**
 * Fills the buffer from the file position, a short read would otherwise leave zero filled bytes that parse as data
 */
const readExactAsync = async (
  file: fs.FileHandle,
  buffer: Buffer,
  position: number,
): Promise<void> => {
  const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
  if (bytesRead !== buffer.length) {
    throw new Error("Unexpected end of the package file");
  }
};

/**
 * Reads item headers and metadata from a package without loading large data segment payloads into memory.
 *
 * @param wanted Predicate filter to retain matching items and skip others.
 */
export const readTpacItemsAsync = async (
  filePath: string,
  wanted: (type: string, name: string) => boolean,
): Promise<ITpacItem[]> => {
  const file = await fs.open(filePath, "r");
  try {
    const intro = Buffer.alloc(40);
    await readExactAsync(file, intro, 0);
    const introReader = new Reader(intro);
    if (introReader.u32() !== TPAC_MAGIC) {
      throw new Error(`Not an asset package: ${filePath}`);
    }
    const packageVersion = introReader.u32();
    introReader.guid();
    const itemCount = introReader.u32();
    const itemHeadersSize = introReader.u32();
    introReader.u32(); // reserved

    // Item headers immediately follow the package intro, followed by data segment blocks
    const header = Buffer.alloc(introReader.position + itemHeadersSize);
    await readExactAsync(file, header, 0);
    const reader = new Reader(header);
    reader.position = introReader.position;

    const items: ITpacItem[] = [];
    for (let index = 0; index < itemCount; index++) {
      const type = reader.guid();
      const guid = reader.guid();
      const version = packageVersion > 1 ? reader.u32() : 0;
      const name = reader.string();
      const metadata = reader.bytes(reader.u64());
      reader.u64(); // checksum

      const segments: ITpacSegment[] = [];
      const segmentCount = reader.u32();
      for (let segment = 0; segment < segmentCount; segment++) {
        const offset = reader.u64();
        const actualSize = reader.u64();
        const storageSize = reader.u64();
        const owner = reader.guid();
        const segmentType = reader.guid();
        reader.u64();
        reader.u32();
        const storageFormat = reader.u8();
        segments.push({
          offset,
          actualSize,
          storageSize,
          owner,
          type: segmentType,
          storageFormat,
        });
      }
      const dependencyCount = reader.u32();
      reader.skip(dependencyCount * 48);

      if (wanted(type, name)) {
        items.push({
          filePath,
          type,
          guid,
          version,
          name,
          // Copy metadata buffer so the remainder of the header can be read
          metadata: Buffer.from(metadata),
          segments,
        });
      }
    }
    return items;
  } finally {
    await file.close();
  }
};

const readSegmentAsync = async (
  filePath: string,
  segment: ITpacSegment,
): Promise<Buffer> => {
  const file = await fs.open(filePath, "r");
  try {
    const stored = Buffer.alloc(segment.storageSize);
    await readExactAsync(file, stored, segment.offset);
    switch (segment.storageFormat) {
      case STORAGE_UNCOMPRESSED:
        return stored;
      case STORAGE_LZ4: {
        const data = decompressLz4Block(stored, segment.actualSize);
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      }
      default:
        throw new Error(`Unknown storage format ${segment.storageFormat}`);
    }
  } finally {
    await file.close();
  }
};

/**
 * Parses texture metadata up through the format string (subsequent fields appended in newer versions are ignored).
 */
export const readTpacTextureAsync = async (
  item: ITpacItem,
): Promise<ITpacTexture> => {
  const reader = new Reader(item.metadata);
  reader.u32(); // version
  reader.guid(); // billboard material
  reader.u32();
  reader.string(); // source file
  reader.u64();
  reader.u8();
  reader.u32();
  reader.stringList(); // flags
  reader.u32();
  reader.u8();
  const width = reader.u32();
  const height = reader.u32();
  reader.u32();
  reader.u8(); // mipmap count
  reader.u16(); // array count
  const format: TpacTextureFormat =
    reader.string() === "BC7" ? "BC7" : "unknown";

  const pixels = item.segments.find(
    (segment) => segment.type === TEXTURE_PIXELS,
  );
  if (pixels === undefined) {
    throw new Error(`Texture ${item.name} has no pixel data`);
  }
  return {
    width,
    height,
    format,
    pixels: await readSegmentAsync(item.filePath, pixels),
  };
};

/**
 * Resolves texture bindings for a material by slot index (slot 0 corresponds to the diffuse texture).
 */
export const readTpacMaterialTextures = (
  item: ITpacItem,
): Map<number, string> => {
  const reader = new Reader(item.metadata);
  reader.u32(); // version
  reader.guid(); // billboard
  reader.u32(); // sub-version
  reader.u32();
  reader.stringList(); // flags
  reader.u32();
  reader.stringList(); // vertex layout flags
  reader.string(); // blend mode
  reader.guid(); // shader
  const textures = new Map<number, string>();
  const count = reader.i32();
  for (let index = 0; index < count; index++) {
    const slot = reader.i32();
    textures.set(slot, reader.guid());
  }
  return textures;
};

const readMesh = (reader: Reader): ITpacMesh => {
  reader.u8(); // is complete
  const lod = reader.i32();
  reader.u32();
  reader.guid(); // second material
  const subVersion = reader.u32();
  const guid = reader.guid();
  reader.string(); // name
  reader.u32();
  reader.stringList(); // flags
  reader.guid(); // material
  reader.skip(4 * 16); // factor colours and vector arguments
  reader.i32(); // vertex key count
  reader.i32(); // position count
  reader.i32(); // face count
  const vertexCount = reader.i32();
  reader.i32(); // skin data size
  reader.i32(); // bounding box type
  // Bounding box minimum, maximum, and center as vec4, followed by bounding sphere radius
  const minX = reader.f32();
  const minY = reader.f32();
  reader.skip(8);
  const maxX = reader.f32();
  const maxY = reader.f32();
  reader.skip(8 + 16 + 4);
  reader.i32();
  reader.stringList(); // material flags
  reader.f32();
  reader.string(); // clothing material
  reader.skip(9 * 4);
  reader.i32();
  reader.u8();
  reader.u8();
  if (subVersion >= 1) {
    reader.skip(2 * 4 + 1);
  }
  return { guid, lod, vertexCount, boundingBox: { minX, minY, maxX, maxY } };
};

/**
 * Parses mesh metadata across all LOD levels for a metamesh.
 */
export const readTpacMetameshMeshes = (item: ITpacItem): ITpacMesh[] => {
  const reader = new Reader(item.metadata);
  const version = reader.u32();
  reader.guid(); // material
  reader.f32();
  reader.string();
  reader.guid(); // cloth metamesh
  if (version >= 1) {
    reader.u32();
    if (reader.u32() > 0) {
      reader.string(); // cloth
    }
  }
  const count = reader.i32();
  return Array.from({ length: count }, () => readMesh(reader));
};

// Byte lengths of subsequent payload buffers (stored in alternating array entries)
const VERTEX_ARRAY_SIZES = 26;
const VERTEX_ARRAY_SIZES_WITH_QTANGENTS = 28;
const COLOR_SIZE = 4;
const UV_SIZE = 8;
const POSITION_SIZE = 12;

/**
 * Reads vertex streams (indices, colors, and positions) for a specific LOD mesh within a metamesh.
 */
export const readTpacVertexStreamAsync = async (
  item: ITpacItem,
  mesh: ITpacMesh,
): Promise<ITpacVertexStream> => {
  const segment = item.segments.find(
    (candidate) =>
      candidate.type === VERTEX_STREAM && candidate.owner === mesh.guid,
  );
  if (segment === undefined) {
    throw new Error(`Mesh of ${item.name} has no vertex stream`);
  }
  const reader = new Reader(await readSegmentAsync(item.filePath, segment));

  const indexCount = reader.i32();
  const indices = Array.from({ length: indexCount }, () =>
    mesh.vertexCount >= 0xffff ? reader.i32() : reader.u16(),
  );
  // Metamesh version 1+ includes a Q-tangent buffer
  const sizes = Array.from(
    {
      length:
        item.version >= 1
          ? VERTEX_ARRAY_SIZES_WITH_QTANGENTS
          : VERTEX_ARRAY_SIZES,
    },
    () => reader.u64(),
  );
  const colors1 = sizes[1]!;
  const colors2 = sizes[3]!;
  const uv1 = sizes[5]!;
  const uv2 = sizes[7]!;
  const positions = sizes[9]!;

  const colors = new Uint8Array(reader.bytes(colors1));
  reader.skip(colors2 - (colors2 % COLOR_SIZE));
  reader.skip(uv1 - (uv1 % UV_SIZE));
  reader.skip(uv2 - (uv2 % UV_SIZE));
  const positionBytes = reader.bytes(positions - (positions % POSITION_SIZE));
  const positionValues = new Float32Array(positionBytes.length / 4);
  for (let index = 0; index < positionValues.length; index++) {
    positionValues[index] = positionBytes.readFloatLE(index * 4);
  }
  return { indices, colors, positions: positionValues };
};

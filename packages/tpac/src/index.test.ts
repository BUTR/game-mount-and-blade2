import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ITpacItem,
  ITpacMesh,
  readTpacItemsAsync,
  readTpacMaterialTextures,
  readTpacMetameshMeshes,
  readTpacTextureAsync,
  readTpacVertexStreamAsync,
  TPAC_MATERIAL,
  TPAC_METAMESH,
  TPAC_TEXTURE,
} from "./index";

const TEXTURE_PIXELS = "70ee4e2c-79e4-4b2d-8d54-d53ecd2a559c";
const VERTEX_STREAM = "bb1df897-584f-4770-abf2-663fe449f247";
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";
const TEXTURE_GUID = "01020304-0506-0708-090a-0b0c0d0e0f10";
const MESH_GUID = "aabbccdd-eeff-0011-2233-445566778899";

class Writer {
  private readonly parts: Buffer[] = [];

  public get length(): number {
    return this.parts.reduce((total, part) => total + part.length, 0);
  }

  public buffer = (): Buffer => Buffer.concat(this.parts);

  public bytes = (data: Uint8Array): this => {
    this.parts.push(Buffer.from(data));
    return this;
  };
  public zeros = (count: number): this => this.bytes(Buffer.alloc(count));
  public u8 = (value: number): this => this.bytes(Buffer.of(value));
  public u16 = (value: number): this =>
    this.number(2, (b) => b.writeUInt16LE(value));
  public u32 = (value: number): this =>
    this.number(4, (b) => b.writeUInt32LE(value));
  public i32 = (value: number): this =>
    this.number(4, (b) => b.writeInt32LE(value));
  public f32 = (value: number): this =>
    this.number(4, (b) => b.writeFloatLE(value));
  public u64 = (value: number): this =>
    this.number(8, (b) => b.writeBigUInt64LE(BigInt(value)));

  /**
   * .NET's Guid.ToByteArray: the first three groups little-endian
   */
  public guid = (value: string): this => {
    const groups = value.split("-").map((group) => Buffer.from(group, "hex"));
    groups.slice(0, 3).forEach((group) => group.reverse());
    return this.bytes(Buffer.concat(groups));
  };
  public string = (value: string): this => {
    const data = Buffer.from(value, "utf8");
    return this.u32(data.length).bytes(data);
  };
  public stringList = (values: string[]): this => {
    this.u32(values.length);
    values.forEach((value) => this.string(value));
    return this;
  };

  private number = (size: number, write: (buffer: Buffer) => void): this => {
    const buffer = Buffer.alloc(size);
    write(buffer);
    return this.bytes(buffer);
  };
}

interface ISegmentSpec {
  data: Buffer;
  type: string;
  owner?: string;
  // The stored bytes, when they differ from the data
  stored?: Buffer;
  storageFormat?: number;
}

interface IItemSpec {
  type: string;
  guid: string;
  name: string;
  version?: number;
  metadata?: Buffer;
  segments?: ISegmentSpec[];
  dependencies?: number;
}

const INTRO_SIZE = 36;
const SEGMENT_HEADER_SIZE = 8 * 3 + 16 * 2 + 8 + 4 + 1;

const buildPackage = (items: IItemSpec[], packageVersion = 2): Buffer => {
  const headerSize = (item: IItemSpec): number =>
    32 +
    (packageVersion > 1 ? 4 : 0) +
    4 +
    Buffer.byteLength(item.name) +
    8 +
    (item.metadata?.length ?? 0) +
    8 +
    4 +
    (item.segments?.length ?? 0) * SEGMENT_HEADER_SIZE +
    4 +
    (item.dependencies ?? 0) * 48;
  const headersSize = items.reduce(
    (total, item) => total + headerSize(item),
    0,
  );

  const headers = new Writer();
  const segmentData = new Writer();
  for (const item of items) {
    headers.guid(item.type).guid(item.guid);
    if (packageVersion > 1) {
      headers.u32(item.version ?? 0);
    }
    const metadata = item.metadata ?? Buffer.alloc(0);
    headers.string(item.name).u64(metadata.length).bytes(metadata).u64(0);
    const segments = item.segments ?? [];
    headers.u32(segments.length);
    for (const segment of segments) {
      const stored = segment.stored ?? segment.data;
      headers
        .u64(INTRO_SIZE + headersSize + segmentData.length)
        .u64(segment.data.length)
        .u64(stored.length)
        .guid(segment.owner ?? item.guid)
        .guid(segment.type)
        .u64(0)
        .u32(0)
        .u8(segment.storageFormat ?? 0);
      segmentData.bytes(stored);
    }
    headers.u32(item.dependencies ?? 0).zeros((item.dependencies ?? 0) * 48);
  }

  const intro = new Writer()
    .u32(0x43415054)
    .u32(packageVersion)
    .guid(EMPTY_GUID)
    .u32(items.length)
    .u32(headersSize)
    .u32(0);
  return Buffer.concat([
    intro.buffer(),
    headers.buffer(),
    segmentData.buffer(),
  ]);
};

const textureMetadata = (width: number, height: number, format: string) =>
  new Writer()
    .u32(1)
    .guid(EMPTY_GUID)
    .u32(0)
    .string("source.png")
    .u64(0)
    .u8(0)
    .u32(0)
    .stringList(["flag_a", "flag_b"])
    .u32(0)
    .u8(0)
    .u32(width)
    .u32(height)
    .u32(0)
    .u8(1)
    .u16(1)
    .string(format)
    .u32(12345)
    .buffer();

const materialMetadata = (textures: [slot: number, guid: string][]) => {
  const writer = new Writer()
    .u32(2)
    .guid(EMPTY_GUID)
    .u32(1)
    .u32(0)
    .stringList(["alpha_test"])
    .u32(0)
    .stringList([])
    .string("opaque")
    .guid(EMPTY_GUID)
    .i32(textures.length);
  textures.forEach(([slot, guid]) => writer.i32(slot).guid(guid));
  return writer.buffer();
};

interface IMeshSpec {
  guid: string;
  lod: number;
  vertexCount: number;
  box: [minX: number, minY: number, maxX: number, maxY: number];
  subVersion: number;
}

const writeMesh = (writer: Writer, mesh: IMeshSpec): void => {
  const [minX, minY, maxX, maxY] = mesh.box;
  writer
    .u8(1)
    .i32(mesh.lod)
    .u32(0)
    .guid(EMPTY_GUID)
    .u32(mesh.subVersion)
    .guid(mesh.guid)
    .string("mesh name")
    .u32(0)
    .stringList(["mesh_flag"])
    .guid(EMPTY_GUID)
    .zeros(4 * 16)
    .i32(0)
    .i32(0)
    .i32(0)
    .i32(mesh.vertexCount)
    .i32(0)
    .i32(0)
    .f32(minX)
    .f32(minY)
    .zeros(8)
    .f32(maxX)
    .f32(maxY)
    .zeros(8 + 16 + 4)
    .i32(0)
    .stringList(["material_flag"])
    .f32(0)
    .string("cloth material")
    .zeros(9 * 4)
    .i32(0)
    .u8(0)
    .u8(0);
  if (mesh.subVersion >= 1) {
    writer.zeros(2 * 4 + 1);
  }
};

const metameshMetadata = (version: number, meshes: IMeshSpec[]) => {
  const writer = new Writer()
    .u32(version)
    .guid(EMPTY_GUID)
    .f32(1)
    .string("")
    .guid(EMPTY_GUID);
  if (version >= 1) {
    writer.u32(0).u32(1).string("cloth");
  }
  writer.i32(meshes.length);
  meshes.forEach((mesh) => writeMesh(writer, mesh));
  return writer.buffer();
};

const vertexStream = (
  indices: number[],
  wideIndices: boolean,
  colors: number[],
  positions: number[],
  arrayCount: number,
): Buffer => {
  const writer = new Writer().i32(indices.length);
  indices.forEach((index) =>
    wideIndices ? writer.i32(index) : writer.u16(index),
  );
  const uv = Buffer.alloc(8 * (colors.length / 4), 0x55);
  const sizes = Array.from({ length: arrayCount }, () => 0);
  sizes[1] = colors.length;
  sizes[3] = colors.length;
  sizes[5] = uv.length;
  sizes[7] = uv.length;
  sizes[9] = positions.length * 4;
  sizes.forEach((size) => writer.u64(size));
  writer.bytes(Uint8Array.from(colors));
  writer.bytes(Buffer.alloc(colors.length, 0x77));
  writer.bytes(uv).bytes(uv);
  positions.forEach((value) => writer.f32(value));
  return writer.buffer();
};

/**
 * A raw LZ4 block of literals only
 */
const lz4Literals = (data: Buffer): Buffer => {
  const lengthBytes: number[] = [];
  let token = data.length;
  if (data.length >= 15) {
    token = 15;
    let rest = data.length - 15;
    while (rest >= 255) {
      lengthBytes.push(255);
      rest -= 255;
    }
    lengthBytes.push(rest);
  }
  return Buffer.concat([Buffer.of(token << 4, ...lengthBytes), data]);
};

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tpac-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const writePackageAsync = async (data: Buffer): Promise<string> => {
  const filePath = path.join(dir, "test.tpac");
  await fs.writeFile(filePath, data);
  return filePath;
};

const all = (): boolean => true;

describe("readTpacItemsAsync", () => {
  it("reads every item's type, GUID, version, name, metadata and segments", async () => {
    const pixels = Buffer.from("pixels");
    const data = buildPackage([
      {
        type: TPAC_TEXTURE,
        guid: TEXTURE_GUID,
        name: "banner_icons_01",
        version: 3,
        metadata: Buffer.from("meta"),
        segments: [{ data: pixels, type: TEXTURE_PIXELS }],
        dependencies: 2,
      },
      {
        type: TPAC_MATERIAL,
        guid: MESH_GUID,
        name: "custom_banner_icons_01",
      },
    ]);
    const filePath = await writePackageAsync(data);

    const items = await readTpacItemsAsync(filePath, all);

    expect(items).toEqual([
      {
        filePath,
        type: TPAC_TEXTURE,
        guid: TEXTURE_GUID,
        version: 3,
        name: "banner_icons_01",
        metadata: Buffer.from("meta"),
        segments: [
          {
            // The only segment's data ends the package
            offset: data.length - pixels.length,
            actualSize: pixels.length,
            storageSize: pixels.length,
            owner: TEXTURE_GUID,
            type: TEXTURE_PIXELS,
            storageFormat: 0,
          },
        ],
      },
      {
        filePath,
        type: TPAC_MATERIAL,
        guid: MESH_GUID,
        version: 0,
        name: "custom_banner_icons_01",
        metadata: Buffer.alloc(0),
        segments: [],
      },
    ]);
  });

  it("reads GUIDs as .NET lays them out, the first three groups little-endian", async () => {
    const data = buildPackage([
      { type: TPAC_TEXTURE, guid: EMPTY_GUID, name: "a" },
    ]);
    // Guid.ToByteArray() of 01020304-0506-0708-090a-0b0c0d0e0f10, over the item's GUID after its type
    Buffer.from([
      0x04, 0x03, 0x02, 0x01, 0x06, 0x05, 0x08, 0x07, 0x09, 0x0a, 0x0b, 0x0c,
      0x0d, 0x0e, 0x0f, 0x10,
    ]).copy(data, INTRO_SIZE + 16);
    const filePath = await writePackageAsync(data);

    const [item] = await readTpacItemsAsync(filePath, all);

    expect(item?.guid).toBe("01020304-0506-0708-090a-0b0c0d0e0f10");
  });

  it("keeps only the items the filter wants, still reading past the others", async () => {
    const filePath = await writePackageAsync(
      buildPackage([
        { type: TPAC_TEXTURE, guid: TEXTURE_GUID, name: "a", dependencies: 1 },
        {
          type: TPAC_MATERIAL,
          guid: MESH_GUID,
          name: "b",
          metadata: Buffer.from("x"),
          segments: [{ data: Buffer.from("y"), type: TEXTURE_PIXELS }],
        },
        { type: TPAC_METAMESH, guid: EMPTY_GUID, name: "c" },
      ]),
    );

    const items = await readTpacItemsAsync(
      filePath,
      (type, name) => type === TPAC_METAMESH || name === "a",
    );

    expect(items.map((item) => item.name)).toEqual(["a", "c"]);
  });

  it("reads version 1 packages, whose items have no version", async () => {
    const filePath = await writePackageAsync(
      buildPackage(
        [
          { type: TPAC_TEXTURE, guid: TEXTURE_GUID, name: "a" },
          { type: TPAC_MATERIAL, guid: MESH_GUID, name: "b" },
        ],
        1,
      ),
    );

    const items = await readTpacItemsAsync(filePath, all);

    expect(
      items.map(({ name, guid, version }) => ({ name, guid, version })),
    ).toEqual([
      { name: "a", guid: TEXTURE_GUID, version: 0 },
      { name: "b", guid: MESH_GUID, version: 0 },
    ]);
  });

  it("reads a package of no items, only the intro", async () => {
    const data = buildPackage([]);
    expect(data).toHaveLength(INTRO_SIZE);
    const filePath = await writePackageAsync(data);

    await expect(readTpacItemsAsync(filePath, all)).resolves.toEqual([]);
  });

  it("rejects a file without the package magic", async () => {
    const data = buildPackage([]);
    data.writeUInt32LE(0x12345678, 0);
    const filePath = await writePackageAsync(data);

    await expect(readTpacItemsAsync(filePath, all)).rejects.toThrow(
      "Not an asset package",
    );
  });

  it("rejects a file shorter than its declared headers", async () => {
    const data = buildPackage([
      { type: TPAC_TEXTURE, guid: TEXTURE_GUID, name: "a" },
    ]);
    const filePath = await writePackageAsync(data.subarray(0, 60));

    await expect(readTpacItemsAsync(filePath, all)).rejects.toThrow(
      "Unexpected end of the package file",
    );
  });

  it("rejects headers that hold fewer items than declared", async () => {
    const data = buildPackage([
      { type: TPAC_TEXTURE, guid: TEXTURE_GUID, name: "a" },
    ]);
    data.writeUInt32LE(2, 24);
    const filePath = await writePackageAsync(data);

    await expect(readTpacItemsAsync(filePath, all)).rejects.toThrow(
      "Unexpected end of the package data",
    );
  });

  it("rejects an implausibly long string, a sign of misaligned headers", async () => {
    const data = buildPackage([
      { type: TPAC_TEXTURE, guid: TEXTURE_GUID, name: "a" },
    ]);
    data.writeUInt32LE(70000, INTRO_SIZE + 32 + 4);
    const filePath = await writePackageAsync(data);

    await expect(readTpacItemsAsync(filePath, all)).rejects.toThrow(
      "Unexpected string length 70000",
    );
  });
});

describe("readTpacTextureAsync", () => {
  const readTextureAsync = async (
    format: string,
    segments: ISegmentSpec[],
  ): Promise<ITpacItem> => {
    const filePath = await writePackageAsync(
      buildPackage([
        { type: TPAC_MATERIAL, guid: MESH_GUID, name: "before" },
        {
          type: TPAC_TEXTURE,
          guid: TEXTURE_GUID,
          name: "texture",
          metadata: textureMetadata(512, 256, format),
          segments,
        },
      ]),
    );
    const items = await readTpacItemsAsync(filePath, all);
    return items[1]!;
  };

  it("reads the size and format and the uncompressed pixels", async () => {
    const pixels = Buffer.from(Array.from({ length: 64 }, (_, i) => i));
    const item = await readTextureAsync("BC7", [
      { data: Buffer.from("other"), type: VERTEX_STREAM },
      { data: pixels, type: TEXTURE_PIXELS },
    ]);

    const texture = await readTpacTextureAsync(item);

    expect(texture.width).toBe(512);
    expect(texture.height).toBe(256);
    expect(texture.format).toBe("BC7");
    expect(Buffer.from(texture.pixels)).toEqual(pixels);
  });

  it("decompresses LZ4 stored pixels", async () => {
    const pixels = Buffer.from(Array.from({ length: 300 }, (_, i) => i & 0xff));
    const item = await readTextureAsync("BC7", [
      {
        data: pixels,
        stored: lz4Literals(pixels),
        storageFormat: 1,
        type: TEXTURE_PIXELS,
      },
    ]);

    const texture = await readTpacTextureAsync(item);

    expect(Buffer.from(texture.pixels)).toEqual(pixels);
  });

  it("maps formats other than BC7 to unknown", async () => {
    const item = await readTextureAsync("DXT5", [
      { data: Buffer.alloc(16), type: TEXTURE_PIXELS },
    ]);

    expect((await readTpacTextureAsync(item)).format).toBe("unknown");
  });

  it("rejects a texture without pixel data", async () => {
    const item = await readTextureAsync("BC7", []);

    await expect(readTpacTextureAsync(item)).rejects.toThrow(
      "Texture texture has no pixel data",
    );
  });

  it("rejects an unknown storage format", async () => {
    const item = await readTextureAsync("BC7", [
      { data: Buffer.alloc(16), type: TEXTURE_PIXELS, storageFormat: 7 },
    ]);

    await expect(readTpacTextureAsync(item)).rejects.toThrow(
      "Unknown storage format 7",
    );
  });

  it("rejects a segment that reaches past the end of the file", async () => {
    const item = await readTextureAsync("BC7", [
      { data: Buffer.alloc(16), type: TEXTURE_PIXELS },
    ]);
    const segment = item.segments[0]!;

    await expect(
      readTpacTextureAsync({
        ...item,
        segments: [{ ...segment, storageSize: segment.storageSize + 100 }],
      }),
    ).rejects.toThrow("Unexpected end of the package file");
  });
});

describe("readTpacMaterialTextures", () => {
  it("maps each texture slot to its texture GUID", () => {
    const item: ITpacItem = {
      filePath: "",
      type: TPAC_MATERIAL,
      guid: MESH_GUID,
      version: 0,
      name: "material",
      metadata: materialMetadata([
        [0, TEXTURE_GUID],
        [3, MESH_GUID],
      ]),
      segments: [],
    };

    expect(readTpacMaterialTextures(item)).toEqual(
      new Map([
        [0, TEXTURE_GUID],
        [3, MESH_GUID],
      ]),
    );
  });

  it("rejects metadata cut short", () => {
    const metadata = materialMetadata([[0, TEXTURE_GUID]]);
    const item: ITpacItem = {
      filePath: "",
      type: TPAC_MATERIAL,
      guid: MESH_GUID,
      version: 0,
      name: "material",
      metadata: metadata.subarray(0, metadata.length - 4),
      segments: [],
    };

    expect(() => readTpacMaterialTextures(item)).toThrow(
      "Unexpected end of the package data",
    );
  });
});

describe("readTpacMetameshMeshes", () => {
  const metamesh = (version: number, meshes: IMeshSpec[]): ITpacItem => ({
    filePath: "",
    type: TPAC_METAMESH,
    guid: EMPTY_GUID,
    version,
    name: "banner_background",
    metadata: metameshMetadata(version, meshes),
    segments: [],
  });

  it("reads each LOD's GUID, vertex count and bounding box", () => {
    const meshes: IMeshSpec[] = [
      {
        guid: MESH_GUID,
        lod: 0,
        vertexCount: 4,
        box: [-1, -2, 3, 4],
        subVersion: 1,
      },
      {
        guid: TEXTURE_GUID,
        lod: 1,
        vertexCount: 70000,
        box: [0, 0, 0.5, 0.25],
        subVersion: 0,
      },
    ];

    expect(readTpacMetameshMeshes(metamesh(1, meshes))).toEqual([
      {
        guid: MESH_GUID,
        lod: 0,
        vertexCount: 4,
        boundingBox: { minX: -1, minY: -2, maxX: 3, maxY: 4 },
      },
      {
        guid: TEXTURE_GUID,
        lod: 1,
        vertexCount: 70000,
        boundingBox: { minX: 0, minY: 0, maxX: 0.5, maxY: 0.25 },
      },
    ]);
  });

  it("reads version 0 metameshes, without the cloth fields", () => {
    const meshes: IMeshSpec[] = [
      {
        guid: MESH_GUID,
        lod: 0,
        vertexCount: 3,
        box: [0, 0, 1, 1],
        subVersion: 0,
      },
    ];

    expect(
      readTpacMetameshMeshes(metamesh(0, meshes)).map((mesh) => mesh.guid),
    ).toEqual([MESH_GUID]);
  });
});

describe("readTpacVertexStreamAsync", () => {
  const COLORS = [255, 1, 2, 3, 0, 4, 5, 6, 128, 7, 8, 9];
  const POSITIONS = [0, 0, 0.5, 1, 0, 0.5, 0, 1, -0.25];

  const readStreamAsync = async (
    itemVersion: number,
    vertexCount: number,
    stored: "plain" | "lz4" = "plain",
  ) => {
    const mesh: ITpacMesh = {
      guid: MESH_GUID,
      lod: 0,
      vertexCount,
      boundingBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const data = vertexStream(
      [0, 1, 2],
      vertexCount >= 0xffff,
      COLORS,
      POSITIONS,
      itemVersion >= 1 ? 28 : 26,
    );
    const filePath = await writePackageAsync(
      buildPackage([
        {
          type: TPAC_METAMESH,
          guid: EMPTY_GUID,
          name: "mesh",
          version: itemVersion,
          segments: [
            {
              data: Buffer.from("other lod"),
              type: VERTEX_STREAM,
              owner: TEXTURE_GUID,
            },
            {
              data,
              type: VERTEX_STREAM,
              owner: MESH_GUID,
              ...(stored === "lz4" && {
                stored: lz4Literals(data),
                storageFormat: 1,
              }),
            },
          ],
        },
      ]),
    );
    const [item] = await readTpacItemsAsync(filePath, all);
    return readTpacVertexStreamAsync(item!, mesh);
  };

  it("reads 16-bit indices, the first color buffer and the positions of the mesh's stream", async () => {
    const stream = await readStreamAsync(0, 3);

    expect(stream.indices).toEqual([0, 1, 2]);
    expect([...stream.colors]).toEqual(COLORS);
    expect([...stream.positions]).toEqual(POSITIONS);
  });

  it("reads 32-bit indices when the mesh has 0xffff vertices or more", async () => {
    const stream = await readStreamAsync(0, 0xffff);

    expect(stream.indices).toEqual([0, 1, 2]);
    expect([...stream.positions]).toEqual(POSITIONS);
  });

  it("skips the Q-tangent sizes of version 1 metameshes", async () => {
    const stream = await readStreamAsync(1, 3);

    expect([...stream.colors]).toEqual(COLORS);
    expect([...stream.positions]).toEqual(POSITIONS);
  });

  it("reads an LZ4 stored stream", async () => {
    const stream = await readStreamAsync(0, 3, "lz4");

    expect([...stream.positions]).toEqual(POSITIONS);
  });

  it("rejects a mesh without a stream of its own", async () => {
    const filePath = await writePackageAsync(
      buildPackage([
        {
          type: TPAC_METAMESH,
          guid: EMPTY_GUID,
          name: "mesh",
          segments: [
            { data: Buffer.alloc(4), type: VERTEX_STREAM, owner: TEXTURE_GUID },
          ],
        },
      ]),
    );
    const [item] = await readTpacItemsAsync(filePath, all);

    await expect(
      readTpacVertexStreamAsync(item!, {
        guid: MESH_GUID,
        lod: 0,
        vertexCount: 3,
        boundingBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      }),
    ).rejects.toThrow("Mesh of mesh has no vertex stream");
  });
});

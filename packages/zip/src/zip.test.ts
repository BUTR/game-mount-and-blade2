import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { constants, crc32, deflateRawSync } from "zlib";
import { readFirstZipEntryAsync } from "./firstEntry";
import {
  DeflateChunk,
  extractZipEntryAsync,
  getZipSizeBound,
  IZipSource,
  readZipEntriesAsync,
  verifyZipAsync,
  writeZipAsync,
  ZIP_CHUNK_SIZE,
} from "./zip";

const MTIME = new Date(2024, 5, 15, 13, 45, 30);

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

// What ISA-L does in the extension, with Node's zlib: a chunk that isn't the last ends with a full flush
const deflateChunk: DeflateChunk = (chunk, last) =>
  Promise.resolve(
    deflateRawSync(chunk, {
      level: 1,
      finishFlush: last ? constants.Z_FINISH : constants.Z_FULL_FLUSH,
    }),
  );

const source = async (
  name: string,
  data: Buffer,
  compress?: boolean,
): Promise<IZipSource> => {
  const filePath = path.join(dir, "files", ...name.split("/"));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  return {
    name,
    filePath,
    size: data.length,
    mtime: MTIME,
    ...(compress !== undefined ? { compress } : {}),
  };
};

const writeArchiveAsync = async (
  sources: IZipSource[],
  options: Parameters<typeof writeZipAsync>[2] = {},
): Promise<string> => {
  const archivePath = path.join(dir, "archive.zip");
  // Reserved as archiving does, the writer cuts it to its size
  await fs.writeFile(
    archivePath,
    Buffer.alloc(getZipSizeBound(sources, options.zip64Threshold)),
  );
  await writeZipAsync(archivePath, sources, options);
  return archivePath;
};

// Compresses well across chunks, like the game's XML
const text = (size: number): Buffer => {
  const line = Buffer.from(
    '<SubModule><Name value="Bannerlord.Harmony"/><DLLName value="Bannerlord.Harmony.dll"/></SubModule>\n',
  );
  return Buffer.concat(
    Array.from({ length: Math.ceil(size / line.length) }, () => line),
  ).subarray(0, size);
};

// toEqual compares a Buffer byte by byte with its diffing, seconds for megabytes
const expectSameBytes = (actual: Buffer, expected: Buffer): void => {
  expect(actual.length).toBe(expected.length);
  expect(Buffer.compare(actual, expected)).toBe(0);
};

const CONTENTS: Record<string, Buffer> = {
  "readme.txt": Buffer.from("Hello, Calradia!"),
  "Modules/Native/data.bin": Buffer.from(
    Array.from({ length: 3000 }, (_, i) => (i * 31) & 0xff),
  ),
  "empty.txt": Buffer.alloc(0),
  "Modules/Ünïcödé/名前.xml": Buffer.from("<xml/>"),
};

const sourcesAsync = (compress?: boolean): Promise<IZipSource[]> =>
  Promise.all(
    Object.entries(CONTENTS).map(([name, data]) =>
      source(name, data, compress),
    ),
  );

const extractAllAsync = async (
  archivePath: string,
): Promise<Record<string, Buffer>> => {
  const extracted: Record<string, Buffer> = {};
  for (const [index, entry] of (
    await readZipEntriesAsync(archivePath)
  ).entries()) {
    const target = path.join(dir, `out-${index}`);
    await extractZipEntryAsync(archivePath, entry, target);
    extracted[entry.name] = await fs.readFile(target);
  }
  return extracted;
};

describe("getZipSizeBound", () => {
  it.each([
    ["stored", false],
    ["deflated", true],
  ])("is at least the size of an archive of %s files", async (_, compress) => {
    const sources = [
      ...(await sourcesAsync(compress)),
      await source("text.xml", text(ZIP_CHUNK_SIZE * 2 + 5), compress),
      await source("random.bin", randomBytes(ZIP_CHUNK_SIZE + 7), compress),
    ];
    const archivePath = path.join(dir, "archive.zip");
    await fs.writeFile(archivePath, Buffer.alloc(0));

    const size = await writeZipAsync(archivePath, sources, { deflateChunk });

    expect(size).toBeLessThanOrEqual(getZipSizeBound(sources));
  });

  it("reserves what deflating can add to a file that doesn't compress", async () => {
    const files = [await source("random.bin", randomBytes(100))];

    expect(getZipSizeBound([{ ...files[0]!, compress: true }])).toBeGreaterThan(
      getZipSizeBound(files),
    );
  });

  it("includes the ZIP64 end records from the threshold up", async () => {
    const files = [await source("a.txt", Buffer.from("abc"))];

    expect(getZipSizeBound(files, 1)).toBe(getZipSizeBound(files) + 56 + 20);
  });
});

describe("writeZipAsync and readZipEntriesAsync", () => {
  it("round-trips names, sizes and CRCs of stored files, each after the one before", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources);

    const entries = await readZipEntriesAsync(archivePath);

    expect(
      entries.map(({ name, method, size, compressedSize, crc }) => ({
        name,
        method,
        size,
        compressedSize,
        crc,
      })),
    ).toEqual(
      Object.entries(CONTENTS).map(([name, data]) => ({
        name,
        method: 0,
        size: data.length,
        compressedSize: data.length,
        crc: crc32(data),
      })),
    );
    let offset = 0;
    for (const entry of entries) {
      expect(entry.headerOffset).toBe(offset);
      offset += 30 + Buffer.byteLength(entry.name) + entry.compressedSize;
    }
  });

  it("cuts the reserved file to the archive's size", async () => {
    const sources = await sourcesAsync(true);
    const archivePath = path.join(dir, "archive.zip");
    await fs.writeFile(archivePath, Buffer.alloc(getZipSizeBound(sources)));

    const size = await writeZipAsync(archivePath, sources, { deflateChunk });

    expect((await fs.stat(archivePath)).size).toBe(size);
    expect(size).toBeLessThan(getZipSizeBound(sources));
  });

  it("deflates the files to compress, which extract and verify as they were", async () => {
    const sources = await sourcesAsync(true);
    const archivePath = await writeArchiveAsync(sources, { deflateChunk });

    const entries = await readZipEntriesAsync(archivePath);

    // The data compresses, the short texts don't shrink and the empty file has nothing to compress
    expect(entries.map((entry) => entry.method)).toEqual([0, 8, 0, 0]);
    expect(entries[1]!.compressedSize).toBeLessThan(entries[1]!.size);
    expect(await extractAllAsync(archivePath)).toEqual(CONTENTS);
    await expect(verifyZipAsync(archivePath, sources)).resolves.toBe(undefined);
  });

  it("joins a file's chunks compressed on their own into one deflate stream", async () => {
    const data = text(ZIP_CHUNK_SIZE * 3 + 1234);
    const sources = [await source("big.xml", data, true)];
    const deflate = vi.fn(deflateChunk);
    const archivePath = await writeArchiveAsync(sources, {
      deflateChunk: deflate,
    });

    const [entry] = await readZipEntriesAsync(archivePath);

    expect(deflate).toHaveBeenCalledTimes(4);
    expect(deflate.mock.calls.map(([, last]) => last)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(entry!.method).toBe(8);
    expect(entry!.compressedSize).toBeLessThan(data.length / 10);
    expectSameBytes((await extractAllAsync(archivePath))["big.xml"]!, data);
  });

  it("stores a file whose first chunk barely compresses", async () => {
    const data = Buffer.concat([
      randomBytes(ZIP_CHUNK_SIZE),
      text(ZIP_CHUNK_SIZE),
    ]);
    const sources = [await source("mixed.bin", data, true)];
    const archivePath = await writeArchiveAsync(sources, { deflateChunk });

    const [entry] = await readZipEntriesAsync(archivePath);

    expect(entry!.method).toBe(0);
    expect(entry!.compressedSize).toBe(data.length);
    expectSameBytes((await extractAllAsync(archivePath))["mixed.bin"]!, data);
  });

  it("doesn't compress the files that aren't to be compressed", async () => {
    const sources = await sourcesAsync(false);
    const deflate = vi.fn(deflateChunk);

    const archivePath = await writeArchiveAsync(sources, {
      deflateChunk: deflate,
    });

    expect(deflate).not.toHaveBeenCalled();
    expect(
      (await readZipEntriesAsync(archivePath)).map((entry) => entry.method),
    ).toEqual([0, 0, 0, 0]);
  });

  it("compresses up to 4 chunks at a time, small files' ones too", async () => {
    const sources = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        source(`file-${index}.xml`, text(1000 + index), true),
      ),
    );
    let running = 0;
    let most = 0;
    // Held until 4 run at once, however slow reading is, or for a while when fewer can
    const held: (() => void)[] = [];
    const deflate: DeflateChunk = async (chunk, last) => {
      most = Math.max(most, ++running);
      await new Promise<void>((resolve) => {
        held.push(resolve);
        if (held.length === 4) {
          held.splice(0).forEach((release) => release());
        } else {
          setTimeout(resolve, 200);
        }
      });
      running--;
      return deflateChunk(chunk, last);
    };

    const archivePath = await writeArchiveAsync(sources, {
      deflateChunk: deflate,
    });

    expect(most).toBe(4);
    await expect(verifyZipAsync(archivePath, sources)).resolves.toBe(undefined);
  });

  it("reports the bytes read from the files", async () => {
    const sources = [
      await source("a.xml", text(ZIP_CHUNK_SIZE + 10), true),
      await source("b.txt", Buffer.from("abc")),
    ];
    const progress: number[] = [];

    await writeArchiveAsync(sources, {
      deflateChunk,
      onProgress: (bytes) => progress.push(bytes),
    });

    expect(progress).toEqual([
      ZIP_CHUNK_SIZE,
      ZIP_CHUNK_SIZE + 10,
      ZIP_CHUNK_SIZE + 13,
    ]);
  });

  it("fails when compressing fails, closing the files", async () => {
    const sources = [
      await source("a.xml", text(ZIP_CHUNK_SIZE * 2), true),
      await source("b.xml", text(100), true),
    ];
    const deflate: DeflateChunk = (chunk, last) =>
      last
        ? Promise.reject(new Error("ISA-L deflate failed"))
        : deflateChunk(chunk, last);

    await expect(
      writeArchiveAsync(sources, { deflateChunk: deflate }),
    ).rejects.toThrow("ISA-L deflate failed");
    // Nothing is left open
    await fs.rm(path.join(dir, "files"), { recursive: true });
    await fs.rm(path.join(dir, "archive.zip"));
  });

  it("fails when a chunk deflates to more than was reserved for it", async () => {
    // The first chunk compresses, the probe keeps the file deflated
    const sources = [await source("a.xml", text(ZIP_CHUNK_SIZE + 1000), true)];
    const deflate: DeflateChunk = (chunk, last) =>
      last ? Promise.resolve(Buffer.alloc(2000)) : deflateChunk(chunk, last);

    await expect(
      writeArchiveAsync(sources, { deflateChunk: deflate }),
    ).rejects.toThrow("more than the space reserved");
  });

  it("writes the UTF-8 flag and the DOS timestamp into the headers", async () => {
    const archivePath = await writeArchiveAsync([
      await source("a.txt", Buffer.from("abc")),
    ]);

    const data = await fs.readFile(archivePath);

    expect(data.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(data.readUInt16LE(10)).toBe((13 << 11) | (45 << 5) | 15);
    expect(data.readUInt16LE(12)).toBe(((2024 - 1980) << 9) | (6 << 5) | 15);
  });

  it("writes an archive whose first entry a general zip reader can read, deflated or not", async () => {
    for (const compress of [false, true]) {
      const sources = [
        await source("first.xml", text(5000), compress),
        ...(await sourcesAsync(compress)),
      ];
      const archivePath = await writeArchiveAsync(sources, { deflateChunk });

      const first = await readFirstZipEntryAsync(
        await fs.readFile(archivePath),
      );

      expect(first).toEqual(text(5000));
    }
  });

  it.each([
    ["stored", false],
    ["deflated", true],
  ])("round-trips %s entries through ZIP64 records", async (_, compress) => {
    const sources = await sourcesAsync(compress);
    const archivePath = await writeArchiveAsync(sources, {
      deflateChunk,
      zip64Threshold: 1,
    });
    const data = await fs.readFile(archivePath);

    const entries = await readZipEntriesAsync(archivePath);

    // The end record defers to the ZIP64 one
    expect(data.readUInt16LE(data.length - 22 + 10)).toBe(0xffff);
    expect(data.readUInt32LE(data.length - 22 + 16)).toBe(0xffffffff);
    expect(entries.map((entry) => entry.size)).toEqual(
      Object.values(CONTENTS).map((contents) => contents.length),
    );
    expect(await extractAllAsync(archivePath)).toEqual(CONTENTS);
    await expect(verifyZipAsync(archivePath, sources)).resolves.toBe(undefined);
  });

  it("reads an archive that ends with a comment", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const data = await fs.readFile(archivePath);
    const comment = Buffer.from("archived by a test");
    data.writeUInt16LE(comment.length, data.length - 2);
    await fs.writeFile(archivePath, Buffer.concat([data, comment]));

    const entries = await readZipEntriesAsync(archivePath);

    expect(entries.map((entry) => entry.name)).toEqual(Object.keys(CONTENTS));
  });

  it("fails when a file grew after it was listed", async () => {
    const file = await source("a.txt", Buffer.from("abc"));
    await fs.writeFile(file.filePath, "abcdef");

    await expect(writeArchiveAsync([file])).rejects.toThrow("grew");
  });

  it("fails when a file shrank after it was listed", async () => {
    const file = await source("a.txt", Buffer.from("abcdef"));
    await fs.writeFile(file.filePath, "abc");

    await expect(writeArchiveAsync([file])).rejects.toThrow("shrank");
  });

  it("rejects a name too long for the header's 16-bit length", async () => {
    const file = await source("a.txt", Buffer.from("abc"));

    await expect(
      writeArchiveAsync([{ ...file, name: "x".repeat(0x10000) }]),
    ).rejects.toThrow("too long");
  });

  it("rejects a file without an end of central directory record", async () => {
    const archivePath = path.join(dir, "not.zip");
    await fs.writeFile(archivePath, Buffer.alloc(100, 1));

    await expect(readZipEntriesAsync(archivePath)).rejects.toThrow(
      "no central directory",
    );
  });

  it("rejects a central directory that reaches past the end of the file", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const data = await fs.readFile(archivePath);
    data.writeUInt32LE(data.length, data.length - 22 + 16);
    await fs.writeFile(archivePath, data);

    await expect(readZipEntriesAsync(archivePath)).rejects.toThrow("truncated");
  });

  it("rejects a central directory whose records lack their signature", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const data = await fs.readFile(archivePath);
    data.writeUInt32LE(0, data.readUInt32LE(data.length - 22 + 16));
    await fs.writeFile(archivePath, data);

    await expect(readZipEntriesAsync(archivePath)).rejects.toThrow(
      "central directory is broken",
    );
  });

  it("rejects a ZIP64 end record without its locator", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync(), {
      zip64Threshold: 1,
    });
    const data = await fs.readFile(archivePath);
    data.writeUInt32LE(0, data.length - 22 - 20);
    await fs.writeFile(archivePath, data);

    await expect(readZipEntriesAsync(archivePath)).rejects.toThrow(
      "locator is missing",
    );
  });

  it("rejects a ZIP64 locator that doesn't point at the ZIP64 end record", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync(), {
      zip64Threshold: 1,
    });
    const data = await fs.readFile(archivePath);
    // The locator's offset of the end record, pointed at the first local header
    data.writeBigUInt64LE(0n, data.length - 22 - 20 + 8);
    await fs.writeFile(archivePath, data);

    await expect(readZipEntriesAsync(archivePath)).rejects.toThrow(
      "ZIP64 directory is missing",
    );
  });
});

describe("verifyZipAsync", () => {
  it("accepts an archive with every file intact, reporting the bytes read back", async () => {
    const sources = await sourcesAsync(true);
    const archivePath = await writeArchiveAsync(sources, { deflateChunk });
    const progress: number[] = [];

    await verifyZipAsync(archivePath, sources, (bytes) => progress.push(bytes));

    expect(progress.at(-1)).toBe(
      Object.values(CONTENTS).reduce((sum, data) => sum + data.length, 0),
    );
  });

  it.each([
    ["stored", false],
    ["deflated", true],
  ])(
    "rejects an archive whose %s file data was damaged",
    async (_, compress) => {
      const sources = await sourcesAsync(compress);
      const archivePath = await writeArchiveAsync(sources, { deflateChunk });
      const entry = (await readZipEntriesAsync(archivePath))[1]!;
      const data = await fs.readFile(archivePath);
      const dataOffset =
        entry.headerOffset + 30 + Buffer.byteLength(entry.name);
      const damaged = dataOffset + Math.floor(entry.compressedSize / 2);
      data[damaged] = data[damaged]! ^ 0xff;
      await fs.writeFile(archivePath, data);

      await expect(verifyZipAsync(archivePath, sources)).rejects.toThrow(
        "wasn't written correctly",
      );
    },
  );

  it("rejects an archive whose file data is cut off", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources);
    const data = await fs.readFile(archivePath);
    const central = data.readUInt32LE(data.length - 22 + 16);
    // The first entry's local header, pointed past the end of the archive
    data.writeUInt32LE(data.length - 10, central + 42);
    await fs.writeFile(archivePath, data);

    await expect(verifyZipAsync(archivePath, sources)).rejects.toThrow(
      "truncated",
    );
  });

  it("rejects an archive with a different number of files", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources.slice(1));

    await expect(verifyZipAsync(archivePath, sources)).rejects.toThrow(
      "doesn't have every file",
    );
  });

  it("rejects an archive whose files are named differently", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources);

    await expect(
      verifyZipAsync(archivePath, [
        { ...sources[0]!, name: "other.txt" },
        ...sources.slice(1),
      ]),
    ).rejects.toThrow("'other.txt' is missing");
  });
});

describe("extractZipEntryAsync", () => {
  it("extracts stored files, empty ones included, reporting the bytes written", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const entries = await readZipEntriesAsync(archivePath);

    for (const [index, entry] of entries.entries()) {
      const target = path.join(dir, `out-${index}`);
      const progress: number[] = [];
      await extractZipEntryAsync(archivePath, entry, target, (bytes) =>
        progress.push(bytes),
      );

      expect(await fs.readFile(target)).toEqual(CONTENTS[entry.name]);
      expect(progress.at(-1) ?? 0).toBe(entry.size);
    }
  });

  it("inflates a deflated file", async () => {
    const original = CONTENTS["Modules/Native/data.bin"]!;
    const archivePath = await writeArchiveAsync(await sourcesAsync(true), {
      deflateChunk,
    });
    const entry = (await readZipEntriesAsync(archivePath))[1]!;
    const target = path.join(dir, "out");

    await extractZipEntryAsync(archivePath, entry, target);

    expect(entry.method).toBe(8);
    expect(await fs.readFile(target)).toEqual(original);
  });

  it("removes the target when the CRC doesn't match", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const entry = (await readZipEntriesAsync(archivePath))[0]!;
    const target = path.join(dir, "out");

    await expect(
      extractZipEntryAsync(
        archivePath,
        { ...entry, crc: entry.crc ^ 1 },
        target,
      ),
    ).rejects.toThrow("damaged");
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it("removes the target when the size doesn't match", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const entry = (await readZipEntriesAsync(archivePath))[0]!;
    const target = path.join(dir, "out");

    await expect(
      extractZipEntryAsync(
        archivePath,
        { ...entry, size: entry.size + 1 },
        target,
      ),
    ).rejects.toThrow("damaged");
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it("removes the target when the deflated data is damaged", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync(true), {
      deflateChunk,
    });
    const entry = (await readZipEntriesAsync(archivePath))[1]!;
    const target = path.join(dir, "out");

    await expect(
      extractZipEntryAsync(
        archivePath,
        { ...entry, compressedSize: Math.floor(entry.compressedSize / 2) },
        target,
      ),
    ).rejects.toThrow();
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it("doesn't overwrite an existing target", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const entry = (await readZipEntriesAsync(archivePath))[0]!;
    const target = path.join(dir, "out");
    await fs.writeFile(target, "keep me");

    await expect(
      extractZipEntryAsync(archivePath, entry, target),
    ).rejects.toThrow();
    expect(await fs.readFile(target, "utf8")).toBe("keep me");
  });

  it("rejects an entry whose local header is missing", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const entry = (await readZipEntriesAsync(archivePath))[1]!;

    await expect(
      extractZipEntryAsync(
        archivePath,
        { ...entry, headerOffset: entry.headerOffset + 1 },
        path.join(dir, "out"),
      ),
    ).rejects.toThrow("broken header");
  });

  it("rejects compression methods other than stored and deflated", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const entry = (await readZipEntriesAsync(archivePath))[0]!;
    const target = path.join(dir, "out");

    await expect(
      extractZipEntryAsync(archivePath, { ...entry, method: 14 }, target),
    ).rejects.toThrow("compression method 14");
    await expect(fs.stat(target)).rejects.toThrow();
  });
});

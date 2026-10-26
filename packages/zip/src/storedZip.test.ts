import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crc32, deflateRawSync } from "zlib";
import { readFirstZipEntryAsync } from "./firstEntry";
import {
  extractZipEntryAsync,
  IZipSource,
  layoutZip,
  readZipEntriesAsync,
  verifyZipAsync,
  writeZipAsync,
} from "./storedZip";

const MTIME = new Date(2024, 5, 15, 13, 45, 30);

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "stored-zip-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const source = async (name: string, data: Buffer): Promise<IZipSource> => {
  const filePath = path.join(dir, "files", ...name.split("/"));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  return { name, filePath, size: data.length, mtime: MTIME };
};

const writeArchiveAsync = async (
  sources: IZipSource[],
  zip64Threshold?: number,
): Promise<string> => {
  const archivePath = path.join(dir, "archive.zip");
  const layout = layoutZip(sources, zip64Threshold);
  await fs.writeFile(archivePath, Buffer.alloc(layout.size));
  await writeZipAsync(archivePath, layout);
  return archivePath;
};

const CONTENTS: Record<string, Buffer> = {
  "readme.txt": Buffer.from("Hello, Calradia!"),
  "Modules/Native/data.bin": Buffer.from(
    Array.from({ length: 3000 }, (_, i) => (i * 31) & 0xff),
  ),
  "empty.txt": Buffer.alloc(0),
  "Modules/Ünïcödé/名前.xml": Buffer.from("<xml/>"),
};

const sourcesAsync = (): Promise<IZipSource[]> =>
  Promise.all(
    Object.entries(CONTENTS).map(([name, data]) => source(name, data)),
  );

describe("layoutZip", () => {
  it("places each file after its local header and the central directory after the files", async () => {
    const files = [
      await source("a.txt", Buffer.from("abc")),
      await source("bb.txt", Buffer.from("hello")),
    ];

    const layout = layoutZip(files);

    expect(
      layout.entries.map(({ headerOffset, dataOffset, zip64 }) => ({
        headerOffset,
        dataOffset,
        zip64,
      })),
    ).toEqual([
      { headerOffset: 0, dataOffset: 30 + 5, zip64: false },
      { headerOffset: 38, dataOffset: 38 + 30 + 6, zip64: false },
    ]);
    expect(layout.centralOffset).toBe(79);
    expect(layout.centralSize).toBe(46 + 5 + 46 + 6);
    expect(layout.zip64End).toBe(false);
    expect(layout.size).toBe(79 + 103 + 22);
  });

  it("adds ZIP64 records from the threshold up, to the entries that reach it and the end", async () => {
    const files = [
      await source("a.txt", Buffer.from("abc")),
      await source("b.txt", Buffer.from("abc")),
    ];

    const layout = layoutZip(files, 30);

    expect(layout.entries.map((entry) => entry.zip64)).toEqual([false, true]);
    expect(layout.entries[1]!.dataOffset).toBe(38 + 30 + 5 + 20);
    expect(layout.centralSize).toBe(46 + 5 + 46 + 5 + 28);
    expect(layout.zip64End).toBe(true);
    expect(layout.size).toBe(
      layout.centralOffset + layout.centralSize + 56 + 20 + 22,
    );
  });

  it("uses ZIP64 for an entry whose own size reaches the threshold", async () => {
    const layout = layoutZip([await source("a", Buffer.alloc(100))], 100);

    expect(layout.entries[0]!.zip64).toBe(true);
  });

  it("rejects a name too long for the header's 16-bit length", () => {
    expect(() =>
      layoutZip([
        { name: "x".repeat(0x10000), filePath: "", size: 0, mtime: MTIME },
      ]),
    ).toThrow("too long");
  });
});

describe("writeZipAsync and readZipEntriesAsync", () => {
  it("round-trips names, sizes and CRCs of stored files", async () => {
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
    expect(entries.map((entry) => entry.headerOffset)).toEqual(
      layoutZip(sources).entries.map((entry) => entry.headerOffset),
    );
  });

  it("writes an archive exactly as large as its layout", async () => {
    const sources = await sourcesAsync();
    const archivePath = path.join(dir, "archive.zip");
    await fs.writeFile(archivePath, Buffer.alloc(0));

    const layout = layoutZip(sources);
    await writeZipAsync(archivePath, layout);

    expect((await fs.stat(archivePath)).size).toBe(layout.size);
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

  it("writes an archive whose first entry a general zip reader can read", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync());

    const first = await readFirstZipEntryAsync(await fs.readFile(archivePath));

    expect(first).toEqual(CONTENTS["readme.txt"]);
  });

  it("round-trips entries through ZIP64 records", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources, 1);
    const data = await fs.readFile(archivePath);

    const entries = await readZipEntriesAsync(archivePath);

    // The end record defers to the ZIP64 one
    expect(data.readUInt16LE(data.length - 22 + 10)).toBe(0xffff);
    expect(data.readUInt32LE(data.length - 22 + 16)).toBe(0xffffffff);
    expect(
      entries.map(({ name, size, compressedSize, headerOffset }) => ({
        name,
        size,
        compressedSize,
        headerOffset,
      })),
    ).toEqual(
      layoutZip(sources, 1).entries.map((entry) => ({
        name: entry.source.name,
        size: entry.source.size,
        compressedSize: entry.source.size,
        headerOffset: entry.headerOffset,
      })),
    );
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

  it("fails when a file grew after it was laid out", async () => {
    const file = await source("a.txt", Buffer.from("abc"));
    await fs.writeFile(file.filePath, "abcdef");

    await expect(writeArchiveAsync([file])).rejects.toThrow("grew");
  });

  it("fails when a file shrank after it was laid out", async () => {
    const file = await source("a.txt", Buffer.from("abcdef"));
    await fs.writeFile(file.filePath, "abc");

    await expect(writeArchiveAsync([file])).rejects.toThrow("shrank");
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
    const archivePath = await writeArchiveAsync(await sourcesAsync(), 1);
    const data = await fs.readFile(archivePath);
    data.writeUInt32LE(0, data.length - 22 - 20);
    await fs.writeFile(archivePath, data);

    await expect(readZipEntriesAsync(archivePath)).rejects.toThrow(
      "locator is missing",
    );
  });

  it("rejects a ZIP64 locator that doesn't point at the ZIP64 end record", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync(), 1);
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
  it("accepts an archive with every file intact", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources);

    await expect(verifyZipAsync(archivePath, sources)).resolves.toBe(undefined);
  });

  it("rejects an archive whose file data was damaged", async () => {
    const sources = await sourcesAsync();
    const archivePath = await writeArchiveAsync(sources);
    const data = await fs.readFile(archivePath);
    const dataOffset = layoutZip(sources).entries[1]!.dataOffset;
    data[dataOffset + 100] = data[dataOffset + 100]! ^ 0xff;
    await fs.writeFile(archivePath, data);

    await expect(verifyZipAsync(archivePath, sources)).rejects.toThrow(
      "wasn't written correctly",
    );
  });

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

  it("extracts a file stored with ZIP64 records", async () => {
    const archivePath = await writeArchiveAsync(await sourcesAsync(), 1);
    const entry = (await readZipEntriesAsync(archivePath))[1]!;
    const target = path.join(dir, "out");

    await extractZipEntryAsync(archivePath, entry, target);

    expect(await fs.readFile(target)).toEqual(CONTENTS[entry.name]);
  });

  it("inflates a deflated file", async () => {
    const original = CONTENTS["Modules/Native/data.bin"]!;
    const archivePath = await writeArchiveAsync(await sourcesAsync());
    const deflated = deflateRawSync(original);
    const entry = {
      ...(await readZipEntriesAsync(archivePath))[1]!,
      method: 8,
      compressedSize: deflated.length,
    };
    const data = await fs.readFile(archivePath);
    deflated.copy(data, layoutZip(await sourcesAsync()).entries[1]!.dataOffset);
    await fs.writeFile(archivePath, data);
    const target = path.join(dir, "out");

    await extractZipEntryAsync(archivePath, entry, target);

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

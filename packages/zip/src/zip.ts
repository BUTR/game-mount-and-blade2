import { promises as fs } from "fs";
import { pipeline, Readable } from "stream";
import { promisify } from "util";
import { createInflateRaw, crc32, inflateRaw } from "zlib";

const inflateRawAsync = promisify(inflateRaw);

/**
 * Zip archives whose files are stored or deflated, written in a single pass with bounded memory: a file is read and
 * compressed in chunks, several chunks at a time, and written in order. ZIP64 records are written only where a size
 * or offset needs them
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EXTRA_ID = 0x0001;

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_SIZE = 22;
const ZIP64_END_SIZE = 56;
const ZIP64_LOCATOR_SIZE = 20;
// The ZIP64 extra field of a local header: both sizes. Of a central header: both sizes and the offset
const ZIP64_LOCAL_EXTRA_SIZE = 4 + 16;
const ZIP64_CENTRAL_EXTRA_SIZE = 4 + 24;
const MAX_COMMENT_SIZE = 0xffff;

const UINT32_LIMIT = 0xffffffff;
const UINT16_LIMIT = 0xffff;
const VERSION_DEFAULT = 20;
const VERSION_ZIP64 = 45;
// File names are UTF-8
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;

/**
 * The size of the chunks a file is read and compressed in
 */
export const ZIP_CHUNK_SIZE = 1024 * 1024;
// The chunks compressed at the same time, libuv's pool has 4 threads
const CHUNKS_IN_FLIGHT = 4;
// A file whose first chunk deflates to more than this of its size is stored, it barely compresses
const DEFLATE_PROBE_LIMIT = 0.9;
// A deflated file this small at most is read and inflated at once
const SMALL_ENTRY_SIZE = 4 * 1024 * 1024;

/**
 * Compresses one chunk of a raw deflate stream. A chunk that isn't the last ends byte aligned without a final block,
 * so the chunks' outputs joined in order are the file's deflate stream. Chunks are compressed at the same time, the
 * chunk's memory must be left as it is
 */
export type DeflateChunk = (
  chunk: Uint8Array,
  last: boolean,
) => Promise<Uint8Array>;

export interface IZipSource {
  /**
   * The file's path inside the archive, '/' separated
   */
  name: string;
  /**
   * The file on disk
   */
  filePath: string;
  size: number;
  mtime: Date;
  /**
   * Whether to deflate it, a file that doesn't compress is stored anyway. Already compressed formats skip the work
   */
  compress?: boolean;
}

/**
 * The most a chunk can deflate to: stored blocks' headers, 5 bytes each of up to 16 KB, and the flush's bits
 */
const getChunkBound = (size: number): number =>
  size + (Math.floor(size / 16384) + 1) * 5 + 64;

/**
 * The most a file can take in the archive
 */
const getDataBound = (source: IZipSource): number => {
  if (source.compress !== true || source.size === 0) {
    return source.size;
  }
  const fullChunks = Math.floor(source.size / ZIP_CHUNK_SIZE);
  const rest = source.size % ZIP_CHUNK_SIZE;
  return (
    fullChunks * getChunkBound(ZIP_CHUNK_SIZE) +
    (rest > 0 ? getChunkBound(rest) : 0)
  );
};

/**
 * The archive's size at most, with every file that compresses taking the most it can: the space it needs and that is
 * reserved before it's written
 * @param zip64Threshold Sizes and offsets from it up need ZIP64 records, lower only to exercise them
 */
export const getZipSizeBound = (
  sources: readonly IZipSource[],
  zip64Threshold = UINT32_LIMIT,
): number => {
  let offset = 0;
  let centralSize = 0;
  for (const source of sources) {
    const name = Buffer.byteLength(source.name, "utf8");
    // Without knowing the offsets yet, every entry may need ZIP64 records
    offset +=
      LOCAL_HEADER_SIZE + name + ZIP64_LOCAL_EXTRA_SIZE + getDataBound(source);
    centralSize += CENTRAL_HEADER_SIZE + name + ZIP64_CENTRAL_EXTRA_SIZE;
  }
  const zip64End =
    sources.length >= Math.min(UINT16_LIMIT, zip64Threshold) ||
    offset >= zip64Threshold ||
    centralSize >= zip64Threshold;
  return (
    offset +
    centralSize +
    (zip64End ? ZIP64_END_SIZE + ZIP64_LOCATOR_SIZE : 0) +
    END_SIZE
  );
};

interface IWrittenEntry {
  source: IZipSource;
  name: Buffer;
  zip64: boolean;
  method: number;
  crc: number;
  compressedSize: number;
  headerOffset: number;
}

const toDosDateTime = (date: Date): { time: number; date: number } => {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
};

const getLocalHeaderSize = (name: Buffer, zip64: boolean): number =>
  LOCAL_HEADER_SIZE + name.length + (zip64 ? ZIP64_LOCAL_EXTRA_SIZE : 0);

const writeLocalHeader = (entry: IWrittenEntry): Buffer => {
  const { source, name, zip64, method, crc, compressedSize } = entry;
  const header = Buffer.alloc(getLocalHeaderSize(name, zip64));
  const { time, date } = toDosDateTime(source.mtime);
  header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(zip64 ? VERSION_ZIP64 : VERSION_DEFAULT, 4);
  header.writeUInt16LE(FLAG_UTF8, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(zip64 ? UINT32_LIMIT : compressedSize, 18);
  header.writeUInt32LE(zip64 ? UINT32_LIMIT : source.size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(zip64 ? ZIP64_LOCAL_EXTRA_SIZE : 0, 28);
  name.copy(header, LOCAL_HEADER_SIZE);
  if (zip64) {
    const extra = LOCAL_HEADER_SIZE + name.length;
    header.writeUInt16LE(ZIP64_EXTRA_ID, extra);
    header.writeUInt16LE(16, extra + 2);
    header.writeBigUInt64LE(BigInt(source.size), extra + 4);
    header.writeBigUInt64LE(BigInt(compressedSize), extra + 12);
  }
  return header;
};

const writeCentralDirectory = (
  entries: readonly IWrittenEntry[],
  centralOffset: number,
  zip64Threshold: number,
): Buffer => {
  const centralSize = entries.reduce(
    (total, entry) =>
      total +
      CENTRAL_HEADER_SIZE +
      entry.name.length +
      (entry.zip64 ? ZIP64_CENTRAL_EXTRA_SIZE : 0),
    0,
  );
  const zip64End =
    entries.length >= Math.min(UINT16_LIMIT, zip64Threshold) ||
    centralOffset >= zip64Threshold ||
    centralSize >= zip64Threshold;
  const buffer = Buffer.alloc(
    centralSize +
      (zip64End ? ZIP64_END_SIZE + ZIP64_LOCATOR_SIZE : 0) +
      END_SIZE,
  );
  let position = 0;
  for (const entry of entries) {
    const { source, name, zip64, method, crc, compressedSize } = entry;
    const { time, date } = toDosDateTime(source.mtime);
    const version = zip64 ? VERSION_ZIP64 : VERSION_DEFAULT;
    buffer.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, position);
    buffer.writeUInt16LE(version, position + 4);
    buffer.writeUInt16LE(version, position + 6);
    buffer.writeUInt16LE(FLAG_UTF8, position + 8);
    buffer.writeUInt16LE(method, position + 10);
    buffer.writeUInt16LE(time, position + 12);
    buffer.writeUInt16LE(date, position + 14);
    buffer.writeUInt32LE(crc, position + 16);
    buffer.writeUInt32LE(zip64 ? UINT32_LIMIT : compressedSize, position + 20);
    buffer.writeUInt32LE(zip64 ? UINT32_LIMIT : source.size, position + 24);
    buffer.writeUInt16LE(name.length, position + 28);
    buffer.writeUInt16LE(zip64 ? ZIP64_CENTRAL_EXTRA_SIZE : 0, position + 30);
    // Comment length, disk, internal and external attributes stay 0
    buffer.writeUInt32LE(
      zip64 ? UINT32_LIMIT : entry.headerOffset,
      position + 42,
    );
    name.copy(buffer, position + CENTRAL_HEADER_SIZE);
    position += CENTRAL_HEADER_SIZE + name.length;
    if (zip64) {
      buffer.writeUInt16LE(ZIP64_EXTRA_ID, position);
      buffer.writeUInt16LE(24, position + 2);
      buffer.writeBigUInt64LE(BigInt(source.size), position + 4);
      buffer.writeBigUInt64LE(BigInt(compressedSize), position + 12);
      buffer.writeBigUInt64LE(BigInt(entry.headerOffset), position + 20);
      position += ZIP64_CENTRAL_EXTRA_SIZE;
    }
  }

  const count = entries.length;
  if (zip64End) {
    const zip64EndOffset = centralOffset + centralSize;
    buffer.writeUInt32LE(ZIP64_END_SIGNATURE, position);
    buffer.writeBigUInt64LE(BigInt(ZIP64_END_SIZE - 12), position + 4);
    buffer.writeUInt16LE(VERSION_ZIP64, position + 12);
    buffer.writeUInt16LE(VERSION_ZIP64, position + 14);
    // This disk and the central directory's disk stay 0
    buffer.writeBigUInt64LE(BigInt(count), position + 24);
    buffer.writeBigUInt64LE(BigInt(count), position + 32);
    buffer.writeBigUInt64LE(BigInt(centralSize), position + 40);
    buffer.writeBigUInt64LE(BigInt(centralOffset), position + 48);
    position += ZIP64_END_SIZE;
    buffer.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, position);
    buffer.writeBigUInt64LE(BigInt(zip64EndOffset), position + 8);
    buffer.writeUInt32LE(1, position + 16);
    position += ZIP64_LOCATOR_SIZE;
  }

  buffer.writeUInt32LE(END_SIGNATURE, position);
  buffer.writeUInt16LE(zip64End ? UINT16_LIMIT : count, position + 8);
  buffer.writeUInt16LE(zip64End ? UINT16_LIMIT : count, position + 10);
  buffer.writeUInt32LE(zip64End ? UINT32_LIMIT : centralSize, position + 12);
  buffer.writeUInt32LE(zip64End ? UINT32_LIMIT : centralOffset, position + 16);
  return buffer;
};

/**
 * A chunk of a file, compressing when its file is deflated
 */
interface IChunk {
  sourceIndex: number;
  data: Buffer;
  first: boolean;
  last: boolean;
  deflated?: Promise<Uint8Array>;
}

/**
 * The files' chunks in order, each read into its own buffer as several are compressing at the same time. Fails when a
 * file isn't the size it was listed with, it changed since
 */
async function* readChunksAsync(
  sources: readonly IZipSource[],
): AsyncGenerator<IChunk> {
  for (const [sourceIndex, source] of sources.entries()) {
    const file = await fs.open(source.filePath, "r");
    try {
      let read = 0;
      do {
        const data = Buffer.allocUnsafe(
          Math.min(ZIP_CHUNK_SIZE, source.size - read),
        );
        let filled = 0;
        while (filled < data.length) {
          const { bytesRead } = await file.read(
            data,
            filled,
            data.length - filled,
            read + filled,
          );
          if (bytesRead === 0) {
            throw new Error(`'${source.name}' shrank while being archived`);
          }
          filled += bytesRead;
        }
        const first = read === 0;
        read += data.length;
        yield {
          sourceIndex,
          data,
          first,
          last: read === source.size,
        };
      } while (read < source.size);
      const { bytesRead } = await file.read(Buffer.alloc(1), 0, 1, read);
      if (bytesRead > 0) {
        throw new Error(`'${source.name}' grew while being archived`);
      }
    } finally {
      await file.close();
    }
  }
}

/**
 * Writes the archive into a file at least as large as getZipSizeBound reserved, and cuts it to the size it took. A
 * file to compress is deflated by the chunk, several chunks at a time, and stored when its first chunk barely
 * compresses or a single chunk doesn't. Fails when a file isn't the size it was listed with, it changed since
 * @returns The archive's size
 */
export const writeZipAsync = async (
  archivePath: string,
  sources: readonly IZipSource[],
  options: {
    deflateChunk?: DeflateChunk;
    onProgress?: (bytes: number) => void;
    zip64Threshold?: number;
  } = {},
): Promise<number> => {
  const { deflateChunk, onProgress, zip64Threshold = UINT32_LIMIT } = options;
  const shouldDeflate = (source: IZipSource): boolean =>
    deflateChunk !== undefined && source.compress === true && source.size > 0;

  const archive = await fs.open(archivePath, "r+");
  const chunks = readChunksAsync(sources);
  try {
    const entries: IWrittenEntry[] = [];
    // The files whose first chunk was stored, their next chunks aren't compressed
    const stored = new Set<number>();
    const pending: IChunk[] = [];
    let readAll = false;
    const fillAsync = async (): Promise<void> => {
      while (!readAll && pending.length < CHUNKS_IN_FLIGHT) {
        const next = await chunks.next();
        if (next.done === true) {
          readAll = true;
          return;
        }
        const chunk = next.value;
        if (
          shouldDeflate(sources[chunk.sourceIndex]!) &&
          !stored.has(chunk.sourceIndex)
        ) {
          chunk.deflated = deflateChunk!(chunk.data, chunk.last);
          // Awaited in order, one failing meanwhile isn't left unhandled
          chunk.deflated.catch(() => undefined);
        }
        pending.push(chunk);
      }
    };

    let offset = 0;
    let bytes = 0;
    let entry: IWrittenEntry | undefined;
    let dataOffset = 0;
    for (;;) {
      await fillAsync();
      const chunk = pending.shift();
      if (chunk === undefined) {
        break;
      }
      const source = sources[chunk.sourceIndex]!;
      let output: Uint8Array = chunk.data;

      if (chunk.first) {
        const name = Buffer.from(source.name, "utf8");
        if (name.length > UINT16_LIMIT) {
          throw new Error(
            `The path is too long for a zip archive: ${source.name}`,
          );
        }
        let method = METHOD_STORED;
        if (chunk.deflated !== undefined) {
          const deflated = await chunk.deflated;
          const limit = chunk.last
            ? chunk.data.length
            : chunk.data.length * DEFLATE_PROBE_LIMIT;
          if (deflated.length < limit) {
            method = METHOD_DEFLATED;
            output = deflated;
          } else {
            stored.add(chunk.sourceIndex);
          }
        }
        // The compressed size isn't known yet, the most it can be decides
        const zip64 =
          offset >= zip64Threshold ||
          source.size >= zip64Threshold ||
          (method === METHOD_DEFLATED &&
            getDataBound(source) >= zip64Threshold);
        entry = {
          source,
          name,
          zip64,
          method,
          crc: 0,
          compressedSize: 0,
          headerOffset: offset,
        };
        dataOffset = offset + getLocalHeaderSize(name, zip64);
      } else if (entry!.method === METHOD_DEFLATED) {
        output = await chunk.deflated!;
      }

      if (
        entry!.method === METHOD_DEFLATED &&
        output.length > getChunkBound(chunk.data.length)
      ) {
        throw new Error(
          `'${source.name}' deflated to more than the space reserved for it`,
        );
      }
      await archive.write(
        output,
        0,
        output.length,
        dataOffset + entry!.compressedSize,
      );
      entry!.compressedSize += output.length;
      entry!.crc = crc32(chunk.data, entry!.crc);
      bytes += chunk.data.length;
      onProgress?.(bytes);

      if (chunk.last) {
        const header = writeLocalHeader(entry!);
        await archive.write(header, 0, header.length, entry!.headerOffset);
        entries.push(entry!);
        offset = dataOffset + entry!.compressedSize;
        entry = undefined;
      }
    }

    const central = writeCentralDirectory(entries, offset, zip64Threshold);
    await archive.write(central, 0, central.length, offset);
    const size = offset + central.length;
    await archive.truncate(size);
    // On the disk before the files are deleted
    await archive.sync();
    return size;
  } finally {
    // Closes the file being read when writing failed
    await chunks.return(undefined);
    await archive.close();
  }
};

export interface IZipEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
}

const readAtAsync = async (
  file: fs.FileHandle,
  position: number,
  length: number,
): Promise<Buffer> => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("The zip archive is truncated");
  }
  return buffer;
};

/**
 * The files of an archive, from its central directory, ZIP64 included
 */
export const readZipEntriesAsync = async (
  archivePath: string,
): Promise<IZipEntry[]> => {
  const file = await fs.open(archivePath, "r");
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, END_SIZE + MAX_COMMENT_SIZE);
    const tail = await readAtAsync(file, size - tailLength, tailLength);
    const endIndex = tail.lastIndexOf(
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      tail.length - END_SIZE,
    );
    if (endIndex < 0) {
      throw new Error("The zip archive has no central directory");
    }
    let count = tail.readUInt16LE(endIndex + 10);
    let centralSize = tail.readUInt32LE(endIndex + 12);
    let centralOffset = tail.readUInt32LE(endIndex + 16);
    if (
      count === UINT16_LIMIT ||
      centralSize === UINT32_LIMIT ||
      centralOffset === UINT32_LIMIT
    ) {
      const locator = await readAtAsync(
        file,
        size - tailLength + endIndex - ZIP64_LOCATOR_SIZE,
        ZIP64_LOCATOR_SIZE,
      );
      if (locator.readUInt32LE(0) !== ZIP64_LOCATOR_SIGNATURE) {
        throw new Error("The zip archive's ZIP64 locator is missing");
      }
      const end = await readAtAsync(
        file,
        Number(locator.readBigUInt64LE(8)),
        ZIP64_END_SIZE,
      );
      if (end.readUInt32LE(0) !== ZIP64_END_SIGNATURE) {
        throw new Error("The zip archive's ZIP64 directory is missing");
      }
      count = Number(end.readBigUInt64LE(32));
      centralSize = Number(end.readBigUInt64LE(40));
      centralOffset = Number(end.readBigUInt64LE(48));
    }

    const central = await readAtAsync(file, centralOffset, centralSize);
    const entries: IZipEntry[] = [];
    let position = 0;
    for (let i = 0; i < count; i++) {
      if (central.readUInt32LE(position) !== CENTRAL_HEADER_SIGNATURE) {
        throw new Error("The zip archive's central directory is broken");
      }
      const nameLength = central.readUInt16LE(position + 28);
      const extraLength = central.readUInt16LE(position + 30);
      const commentLength = central.readUInt16LE(position + 32);
      const entry: IZipEntry = {
        name: central.toString(
          "utf8",
          position + CENTRAL_HEADER_SIZE,
          position + CENTRAL_HEADER_SIZE + nameLength,
        ),
        method: central.readUInt16LE(position + 10),
        crc: central.readUInt32LE(position + 16),
        compressedSize: central.readUInt32LE(position + 20),
        size: central.readUInt32LE(position + 24),
        headerOffset: central.readUInt32LE(position + 42),
      };

      // The ZIP64 field has the values that didn't fit, in this order
      let extra = position + CENTRAL_HEADER_SIZE + nameLength;
      const extraEnd = extra + extraLength;
      while (extra + 4 <= extraEnd) {
        const id = central.readUInt16LE(extra);
        const length = central.readUInt16LE(extra + 2);
        if (id === ZIP64_EXTRA_ID) {
          let field = extra + 4;
          const next = (): number => {
            const value = Number(central.readBigUInt64LE(field));
            field += 8;
            return value;
          };
          if (entry.size === UINT32_LIMIT) entry.size = next();
          if (entry.compressedSize === UINT32_LIMIT)
            entry.compressedSize = next();
          if (entry.headerOffset === UINT32_LIMIT) entry.headerOffset = next();
        }
        extra += 4 + length;
      }

      entries.push(entry);
      position = extraEnd + commentLength;
    }
    return entries;
  } finally {
    await file.close();
  }
};

/**
 * The file's data in the archive, after its local header
 */
const getDataOffsetAsync = async (
  archive: fs.FileHandle,
  entry: IZipEntry,
): Promise<number> => {
  const header = await readAtAsync(
    archive,
    entry.headerOffset,
    LOCAL_HEADER_SIZE,
  );
  if (header.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`'${entry.name}' has a broken header`);
  }
  return (
    entry.headerOffset +
    LOCAL_HEADER_SIZE +
    header.readUInt16LE(26) +
    header.readUInt16LE(28)
  );
};

/**
 * The file's contents, inflated when it's deflated, in chunks
 */
async function* readEntryAsync(
  archive: fs.FileHandle,
  entry: IZipEntry,
): AsyncGenerator<Buffer> {
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATED) {
    throw new Error(`'${entry.name}' uses compression method ${entry.method}`);
  }
  const dataOffset = await getDataOffsetAsync(archive, entry);
  async function* readStored(): AsyncGenerator<Buffer> {
    let read = 0;
    while (read < entry.compressedSize) {
      const length = Math.min(ZIP_CHUNK_SIZE, entry.compressedSize - read);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await archive.read(
        buffer,
        0,
        length,
        dataOffset + read,
      );
      if (bytesRead !== length) {
        throw new Error("The archive is truncated");
      }
      read += length;
      yield buffer;
    }
  }
  if (entry.method === METHOD_STORED) {
    yield* readStored();
    return;
  }
  // Most files are small: inflated at once on the pool, without a stream's setup for each
  if (
    entry.compressedSize <= ZIP_CHUNK_SIZE &&
    entry.size <= SMALL_ENTRY_SIZE
  ) {
    for await (const compressed of readStored()) {
      yield await inflateRawAsync(compressed);
    }
    return;
  }
  // pipeline, not pipe: the archive failing to read fails the inflating
  const inflate = createInflateRaw();
  pipeline(Readable.from(readStored()), inflate, () => undefined);
  for await (const chunk of inflate) {
    yield chunk as Buffer;
  }
}

/**
 * Copies a file of the archive out, stored or deflated, checking its CRC. Fails without leaving the target behind
 */
export const extractZipEntryAsync = async (
  archivePath: string,
  entry: IZipEntry,
  targetPath: string,
  onBytes?: (bytes: number) => void,
): Promise<void> => {
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATED) {
    throw new Error(`'${entry.name}' uses compression method ${entry.method}`);
  }
  const archive = await fs.open(archivePath, "r");
  try {
    // The header is checked before the target is created
    await getDataOffsetAsync(archive, entry);
    const target = await fs.open(targetPath, "wx");
    try {
      let crc = 0;
      let written = 0;
      for await (const data of readEntryAsync(archive, entry)) {
        crc = crc32(data, crc);
        await target.write(data, 0, data.length, written);
        written += data.length;
        onBytes?.(written);
      }
      if (written !== entry.size || crc >>> 0 !== entry.crc >>> 0) {
        throw new Error(`'${entry.name}' is damaged in the archive`);
      }
      await target.sync();
    } catch (err) {
      await target.close();
      await fs.rm(targetPath, { force: true });
      throw err;
    }
    await target.close();
  } finally {
    await archive.close();
  }
};

/**
 * Reads every file of the archive back, inflating what's deflated, and checks its size and CRC: the archive is whole
 * before anything is deleted
 */
export const verifyZipAsync = async (
  archivePath: string,
  expected: readonly IZipSource[],
  onBytes?: (bytes: number) => void,
): Promise<void> => {
  const entries = await readZipEntriesAsync(archivePath);
  if (entries.length !== expected.length) {
    throw new Error("The archive doesn't have every file");
  }
  for (const [index, entry] of entries.entries()) {
    const source = expected[index]!;
    if (entry.name !== source.name || entry.size !== source.size) {
      throw new Error(`'${source.name}' is missing from the archive`);
    }
  }
  const archive = await fs.open(archivePath, "r");
  let bytes = 0;
  const verifyEntryAsync = async (entry: IZipEntry): Promise<void> => {
    let crc = 0;
    let size = 0;
    try {
      for await (const data of readEntryAsync(archive, entry)) {
        crc = crc32(data, crc);
        size += data.length;
        bytes += data.length;
        onBytes?.(bytes);
      }
    } catch (err) {
      // A deflate stream cut off or damaged is the archive written wrong
      if (
        err instanceof Error &&
        "code" in err &&
        String(err.code).startsWith("Z_")
      ) {
        throw new Error(`'${entry.name}' wasn't written correctly`);
      }
      throw err;
    }
    if (size !== entry.size || crc >>> 0 !== entry.crc >>> 0) {
      throw new Error(`'${entry.name}' wasn't written correctly`);
    }
  };
  // Several files at a time: a small file is mostly waiting on its reads and its inflating on the pool
  let next = 0;
  let failed = false;
  const workerAsync = async (): Promise<void> => {
    while (!failed && next < entries.length) {
      try {
        await verifyEntryAsync(entries[next++]!);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  try {
    // Every worker stops before the file is closed, the first failure is thrown
    const results = await Promise.allSettled(
      Array.from({ length: CHUNKS_IN_FLIGHT }, () => workerAsync()),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure !== undefined) {
      throw failure.reason;
    }
  } finally {
    await archive.close();
  }
};

import { createReadStream, promises as fs } from "fs";
import { createInflateRaw, crc32 } from "zlib";

/**
 * Zip archives whose files are stored as they are, without compression: the archive's size is known before it's
 * written, so its space can be reserved first. ZIP64 records are written only where a size or offset needs them
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

const COPY_BUFFER_SIZE = 1024 * 1024;

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
}

interface IZipLayoutEntry {
  source: IZipSource;
  name: Buffer;
  zip64: boolean;
  headerOffset: number;
  dataOffset: number;
}

export interface IZipLayout {
  entries: IZipLayoutEntry[];
  centralOffset: number;
  centralSize: number;
  zip64End: boolean;
  /**
   * The archive's size, to the byte
   */
  size: number;
}

/**
 * Where everything goes in the archive
 * @param zip64Threshold Sizes and offsets from it up need ZIP64 records, lower only to exercise them
 */
export const layoutZip = (
  sources: readonly IZipSource[],
  zip64Threshold = UINT32_LIMIT,
): IZipLayout => {
  const entries: IZipLayoutEntry[] = [];
  let offset = 0;
  for (const source of sources) {
    const name = Buffer.from(source.name, "utf8");
    if (name.length > UINT16_LIMIT) {
      throw new Error(`The path is too long for a zip archive: ${source.name}`);
    }
    const zip64 = source.size >= zip64Threshold || offset >= zip64Threshold;
    const dataOffset =
      offset +
      LOCAL_HEADER_SIZE +
      name.length +
      (zip64 ? ZIP64_LOCAL_EXTRA_SIZE : 0);
    entries.push({ source, name, zip64, headerOffset: offset, dataOffset });
    offset = dataOffset + source.size;
  }

  const centralOffset = offset;
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
  return {
    entries,
    centralOffset,
    centralSize,
    zip64End,
    size:
      centralOffset +
      centralSize +
      (zip64End ? ZIP64_END_SIZE + ZIP64_LOCATOR_SIZE : 0) +
      END_SIZE,
  };
};

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

const writeLocalHeader = (entry: IZipLayoutEntry, crc: number): Buffer => {
  const { source, name, zip64 } = entry;
  const header = Buffer.alloc(
    LOCAL_HEADER_SIZE + name.length + (zip64 ? ZIP64_LOCAL_EXTRA_SIZE : 0),
  );
  const { time, date } = toDosDateTime(source.mtime);
  header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(zip64 ? VERSION_ZIP64 : VERSION_DEFAULT, 4);
  header.writeUInt16LE(FLAG_UTF8, 6);
  header.writeUInt16LE(METHOD_STORED, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(zip64 ? UINT32_LIMIT : source.size, 18);
  header.writeUInt32LE(zip64 ? UINT32_LIMIT : source.size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(zip64 ? ZIP64_LOCAL_EXTRA_SIZE : 0, 28);
  name.copy(header, LOCAL_HEADER_SIZE);
  if (zip64) {
    const extra = LOCAL_HEADER_SIZE + name.length;
    header.writeUInt16LE(ZIP64_EXTRA_ID, extra);
    header.writeUInt16LE(16, extra + 2);
    header.writeBigUInt64LE(BigInt(source.size), extra + 4);
    header.writeBigUInt64LE(BigInt(source.size), extra + 12);
  }
  return header;
};

const writeCentralDirectory = (
  layout: IZipLayout,
  crcs: readonly number[],
): Buffer => {
  const buffer = Buffer.alloc(layout.size - layout.centralOffset);
  let position = 0;
  layout.entries.forEach((entry, index) => {
    const { source, name, zip64 } = entry;
    const { time, date } = toDosDateTime(source.mtime);
    const version = zip64 ? VERSION_ZIP64 : VERSION_DEFAULT;
    buffer.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, position);
    buffer.writeUInt16LE(version, position + 4);
    buffer.writeUInt16LE(version, position + 6);
    buffer.writeUInt16LE(FLAG_UTF8, position + 8);
    buffer.writeUInt16LE(METHOD_STORED, position + 10);
    buffer.writeUInt16LE(time, position + 12);
    buffer.writeUInt16LE(date, position + 14);
    buffer.writeUInt32LE(crcs[index]!, position + 16);
    buffer.writeUInt32LE(zip64 ? UINT32_LIMIT : source.size, position + 20);
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
      buffer.writeBigUInt64LE(BigInt(source.size), position + 12);
      buffer.writeBigUInt64LE(BigInt(entry.headerOffset), position + 20);
      position += ZIP64_CENTRAL_EXTRA_SIZE;
    }
  });

  const count = layout.entries.length;
  if (layout.zip64End) {
    const zip64EndOffset = layout.centralOffset + layout.centralSize;
    buffer.writeUInt32LE(ZIP64_END_SIGNATURE, position);
    buffer.writeBigUInt64LE(BigInt(ZIP64_END_SIZE - 12), position + 4);
    buffer.writeUInt16LE(VERSION_ZIP64, position + 12);
    buffer.writeUInt16LE(VERSION_ZIP64, position + 14);
    // This disk and the central directory's disk stay 0
    buffer.writeBigUInt64LE(BigInt(count), position + 24);
    buffer.writeBigUInt64LE(BigInt(count), position + 32);
    buffer.writeBigUInt64LE(BigInt(layout.centralSize), position + 40);
    buffer.writeBigUInt64LE(BigInt(layout.centralOffset), position + 48);
    position += ZIP64_END_SIZE;
    buffer.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, position);
    buffer.writeBigUInt64LE(BigInt(zip64EndOffset), position + 8);
    buffer.writeUInt32LE(1, position + 16);
    position += ZIP64_LOCATOR_SIZE;
  }

  buffer.writeUInt32LE(END_SIGNATURE, position);
  buffer.writeUInt16LE(layout.zip64End ? UINT16_LIMIT : count, position + 8);
  buffer.writeUInt16LE(layout.zip64End ? UINT16_LIMIT : count, position + 10);
  buffer.writeUInt32LE(
    layout.zip64End ? UINT32_LIMIT : layout.centralSize,
    position + 12,
  );
  buffer.writeUInt32LE(
    layout.zip64End ? UINT32_LIMIT : layout.centralOffset,
    position + 16,
  );
  return buffer;
};

/**
 * Writes the archive into a file already as large as the layout, copying each source with its CRC. Fails when a
 * source isn't the size it was laid out with, it changed since
 */
export const writeZipAsync = async (
  archivePath: string,
  layout: IZipLayout,
  onProgress?: (bytes: number) => void,
): Promise<void> => {
  const archive = await fs.open(archivePath, "r+");
  try {
    const buffer = Buffer.alloc(COPY_BUFFER_SIZE);
    const crcs: number[] = [];
    let copied = 0;
    for (const entry of layout.entries) {
      const { source } = entry;
      const file = await fs.open(source.filePath, "r");
      let crc = 0;
      let read = 0;
      try {
        for (;;) {
          const { bytesRead } = await file.read(buffer, 0, buffer.length, read);
          if (bytesRead === 0) {
            break;
          }
          if (read + bytesRead > source.size) {
            throw new Error(`'${source.name}' grew while it was archived`);
          }
          const chunk = buffer.subarray(0, bytesRead);
          crc = crc32(chunk, crc);
          await archive.write(chunk, 0, bytesRead, entry.dataOffset + read);
          read += bytesRead;
          copied += bytesRead;
          onProgress?.(copied);
        }
      } finally {
        await file.close();
      }
      if (read !== source.size) {
        throw new Error(`'${source.name}' shrank while it was archived`);
      }
      const header = writeLocalHeader(entry, crc);
      await archive.write(header, 0, header.length, entry.headerOffset);
      crcs.push(crc);
    }

    const central = writeCentralDirectory(layout, crcs);
    await archive.write(central, 0, central.length, layout.centralOffset);
    // On the disk before the files are deleted
    await archive.sync();
  } finally {
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
  let dataOffset: number;
  try {
    const header = await readAtAsync(
      archive,
      entry.headerOffset,
      LOCAL_HEADER_SIZE,
    );
    if (header.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
      throw new Error(`'${entry.name}' has a broken header`);
    }
    dataOffset =
      entry.headerOffset +
      LOCAL_HEADER_SIZE +
      header.readUInt16LE(26) +
      header.readUInt16LE(28);
  } finally {
    await archive.close();
  }

  const target = await fs.open(targetPath, "wx");
  try {
    let crc = 0;
    let written = 0;
    // An empty file has nothing to read, a stream whose end is before its start would read to the archive's end
    if (entry.compressedSize > 0) {
      const stream = createReadStream(archivePath, {
        start: dataOffset,
        end: dataOffset + entry.compressedSize - 1,
      });
      const chunks =
        entry.method === METHOD_DEFLATED
          ? stream.pipe(createInflateRaw())
          : stream;
      for await (const chunk of chunks) {
        const data = chunk as Buffer;
        crc = crc32(data, crc);
        await target.write(data, 0, data.length, written);
        written += data.length;
        onBytes?.(written);
      }
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
};

/**
 * Reads every file of the archive back and checks its CRC, the archive is whole before anything is deleted
 */
export const verifyZipAsync = async (
  archivePath: string,
  expected: readonly IZipSource[],
): Promise<void> => {
  const entries = await readZipEntriesAsync(archivePath);
  if (entries.length !== expected.length) {
    throw new Error("The archive doesn't have every file");
  }
  const archive = await fs.open(archivePath, "r");
  try {
    const buffer = Buffer.alloc(COPY_BUFFER_SIZE);
    for (const [index, entry] of entries.entries()) {
      const source = expected[index]!;
      if (entry.name !== source.name || entry.size !== source.size) {
        throw new Error(`'${source.name}' is missing from the archive`);
      }
      const header = await readAtAsync(
        archive,
        entry.headerOffset,
        LOCAL_HEADER_SIZE,
      );
      let position =
        entry.headerOffset +
        LOCAL_HEADER_SIZE +
        header.readUInt16LE(26) +
        header.readUInt16LE(28);
      let remaining = entry.size;
      let crc = 0;
      while (remaining > 0) {
        const length = Math.min(remaining, buffer.length);
        const { bytesRead } = await archive.read(buffer, 0, length, position);
        if (bytesRead !== length) {
          throw new Error("The archive is truncated");
        }
        crc = crc32(buffer.subarray(0, bytesRead), crc);
        position += bytesRead;
        remaining -= bytesRead;
      }
      if (crc >>> 0 !== entry.crc >>> 0) {
        throw new Error(`'${source.name}' wasn't written correctly`);
      }
    }
  } finally {
    await archive.close();
  }
};

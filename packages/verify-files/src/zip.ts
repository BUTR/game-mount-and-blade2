import { inflateRawSync } from "zlib";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;

const STORED = 0;
const DEFLATED = 8;

export const isZip = (data: Buffer): boolean =>
  data.length >= 4 && data.readUInt32LE(0) === LOCAL_HEADER_SIGNATURE;

/**
 * The first file of a zip archive. The stores zip single files, GOG its hash lists and Steam's CDN its manifests.
 * Read from the central directory, a local header can leave the sizes to a descriptor after the data
 */
export const readFirstZipEntry = (data: Buffer): Buffer => {
  let end = -1;
  const lowest = Math.max(
    0,
    data.length - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_COMMENT_SIZE,
  );
  for (let i = data.length - END_OF_CENTRAL_DIRECTORY_SIZE; i >= lowest; i--) {
    if (data.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    throw new Error("The zip archive has no central directory");
  }

  const central = data.readUInt32LE(end + 16);
  if (data.readUInt32LE(central) !== CENTRAL_HEADER_SIGNATURE) {
    throw new Error("The zip archive's central directory is broken");
  }
  const method = data.readUInt16LE(central + 10);
  const compressedSize = data.readUInt32LE(central + 20);
  const local = data.readUInt32LE(central + 42);
  if (data.readUInt32LE(local) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error("The zip archive's file header is broken");
  }

  const start =
    local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
  const compressed = data.subarray(start, start + compressedSize);
  switch (method) {
    case STORED:
      return compressed;
    case DEFLATED:
      return inflateRawSync(compressed);
    default:
      throw new Error(`The zip archive uses compression method ${method}`);
  }
};

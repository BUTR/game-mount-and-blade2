/**
 * Decompresses raw LZ4 block data without frame headers (the compression format used for .tpac data segments).
 */
export const decompressLz4Block = (
  source: Uint8Array,
  decompressedSize: number,
): Uint8Array => {
  const output = new Uint8Array(decompressedSize);
  let sourcePosition = 0;
  let outputPosition = 0;

  const readLength = (length: number): number => {
    if (length !== 15) {
      return length;
    }
    let byte: number;
    do {
      byte = source[sourcePosition++]!;
      length += byte;
    } while (byte === 255);
    return length;
  };

  while (sourcePosition < source.length) {
    const token = source[sourcePosition++]!;

    const literalLength = readLength(token >> 4);
    output.set(
      source.subarray(sourcePosition, sourcePosition + literalLength),
      outputPosition,
    );
    sourcePosition += literalLength;
    outputPosition += literalLength;
    // The final LZ4 sequence consists of literals only
    if (sourcePosition >= source.length) {
      break;
    }

    const matchOffset =
      source[sourcePosition]! | (source[sourcePosition + 1]! << 8);
    sourcePosition += 2;
    const matchLength = readLength(token & 15) + 4;
    // Matches can overlap previously written output bytes, requiring byte-by-byte copying
    let matchPosition = outputPosition - matchOffset;
    if (matchOffset === 0 || matchPosition < 0) {
      throw new Error("Corrupt LZ4 block");
    }
    for (let i = 0; i < matchLength; i++) {
      output[outputPosition++] = output[matchPosition++]!;
    }
  }

  if (outputPosition !== decompressedSize) {
    throw new Error(
      `LZ4 block decompressed to ${outputPosition} bytes, expected ${decompressedSize}`,
    );
  }
  return output;
};

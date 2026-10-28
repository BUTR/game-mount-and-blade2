/**
 * BC7 (BPTC) block texture decoder, ported from bcdec (https://github.com/iOrange/bcdec, MIT / Unlicense).
 * Used to decode game UI sprite sheets, as Electron does not provide native BC7 decoding APIs.
 */

// The subset each texel of a block belongs to, per partition shape
const PARTITIONS_2 = [
  "0011001100110011",
  "0001000100010001",
  "0111011101110111",
  "0001001100110111",
  "0000000100010011",
  "0011011101111111",
  "0001001101111111",
  "0000000100110111",
  "0000000000010011",
  "0011011111111111",
  "0000000101111111",
  "0000000000010111",
  "0001011111111111",
  "0000000011111111",
  "0000111111111111",
  "0000000000001111",
  "0000100011101111",
  "0111000100000000",
  "0000000010001110",
  "0111001100010000",
  "0011000100000000",
  "0000100011001110",
  "0000000010001100",
  "0111001100110001",
  "0011000100010000",
  "0000100010001100",
  "0110011001100110",
  "0011011001101100",
  "0001011111101000",
  "0000111111110000",
  "0111000110001110",
  "0011100110011100",
  "0101010101010101",
  "0000111100001111",
  "0101101001011010",
  "0011001111001100",
  "0011110000111100",
  "0101010110101010",
  "0110100101101001",
  "0101101010100101",
  "0111001111001110",
  "0001001111001000",
  "0011001001001100",
  "0011101111011100",
  "0110100110010110",
  "0011110011000011",
  "0110011010011001",
  "0000011001100000",
  "0100111001000000",
  "0010011100100000",
  "0000001001110010",
  "0000010011100100",
  "0110110010010011",
  "0011011011001001",
  "0110001110011100",
  "0011100111000110",
  "0110110011001001",
  "0110001100111001",
  "0111111010000001",
  "0001100011100111",
  "0000111100110011",
  "0011001111110000",
  "0010001011101110",
  "0100010001110111",
];
const PARTITIONS_3 = [
  "0011001102212222",
  "0001001122112221",
  "0000200122112211",
  "0222002200110111",
  "0000000011221122",
  "0011001100220022",
  "0022002211111111",
  "0011001122112211",
  "0000000011112222",
  "0000111111112222",
  "0000111122222222",
  "0012001200120012",
  "0112011201120112",
  "0122012201220122",
  "0011011211221222",
  "0011200122002220",
  "0001001101121122",
  "0111001120012200",
  "0000112211221122",
  "0022002200221111",
  "0111011102220222",
  "0001000122212221",
  "0000001101220122",
  "0000110022102210",
  "0122012200110000",
  "0012001211222222",
  "0110122112210110",
  "0000011012211221",
  "0022110211020022",
  "0110011020022222",
  "0011012201220011",
  "0000200022112221",
  "0000000211221222",
  "0222002200120011",
  "0011001200220222",
  "0120012001200120",
  "0000111122220000",
  "0120120120120120",
  "0120201212010120",
  "0011220011220011",
  "0011112222000011",
  "0101010122222222",
  "0000000021212121",
  "0022112200221122",
  "0022001100220011",
  "0220122102201221",
  "0101222222220101",
  "0000212121212121",
  "0101010101012222",
  "0222011102220111",
  "0002111200021112",
  "0000211221122112",
  "0222011101110222",
  "0002111211120002",
  "0110011001102222",
  "0000000021122112",
  "0110011022222222",
  "0022001100110022",
  "0022112211220022",
  "0000000000002112",
  "0002000100020001",
  "0222122202221222",
  "0101222222222222",
  "0111201122012220",
];
// The texel whose index is stored with one bit less, for the 2nd subset of a 2-subset shape
const ANCHORS_2 = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2,
  2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2, 15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2,
  2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15,
];
// The same for the 2nd and 3rd subsets of a 3-subset shape
const ANCHORS_3 = [
  3, 15, 3, 8, 15, 8, 15, 3, 8, 15, 3, 15, 15, 3, 15, 8, 8, 15, 8, 15, 6, 15, 6,
  15, 6, 15, 5, 15, 3, 15, 3, 8, 3, 15, 3, 8, 8, 15, 15, 3, 3, 15, 3, 8, 6, 15,
  10, 8, 5, 3, 8, 15, 8, 6, 6, 10, 8, 15, 5, 15, 15, 10, 15, 8, 8, 15, 15, 3, 3,
  15, 5, 10, 6, 10, 10, 8, 8, 9, 15, 10, 15, 6, 3, 15, 15, 8, 5, 15, 15, 3, 15,
  6, 15, 6, 15, 8, 3, 15, 15, 3, 5, 15, 5, 15, 5, 15, 8, 15, 5, 15, 10, 15, 5,
  15, 10, 15, 8, 15, 13, 15, 15, 3, 12, 15, 3, 15, 3, 8,
];

const WEIGHTS_2 = [0, 21, 43, 64];
const WEIGHTS_3 = [0, 9, 18, 27, 37, 46, 55, 64];
const WEIGHTS_4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
// Per mode, the bits of an endpoint's colour and alpha components before the p-bit
const COLOR_BITS = [4, 6, 5, 7, 5, 7, 7, 5];
const ALPHA_BITS = [0, 0, 0, 0, 6, 8, 7, 5];
// Modes 0, 1, 3, 6 and 7
const MODE_HAS_PBITS = 0b11001011;

const BLOCK_SIZE = 4;
const BLOCK_BYTES = 16;

const toSubsetTable = (partitions: string[]): Uint8Array =>
  Uint8Array.from(partitions.join(""), (digit) => digit.charCodeAt(0) - 48);
const SUBSETS_2 = toSubsetTable(PARTITIONS_2);
const SUBSETS_3 = toSubsetTable(PARTITIONS_3);

// Scratch space reused across block decodes (a single atlas cell contains 16,384 blocks)
const words = new Uint32Array(4);
const endpoints = new Int32Array(6 * 4);
const indices = new Uint8Array(16);
let bitPosition = 0;

/**
 * The block's next bits, lowest first. Reads at most 8 at a time
 */
const readBits = (count: number): number => {
  const word = bitPosition >>> 5;
  const shift = bitPosition & 31;
  let value = words[word]! >>> shift;
  if (shift + count > 32) {
    value |= words[word + 1]! << (32 - shift);
  }
  bitPosition += count;
  return value & ((1 << count) - 1);
};

const interpolate = (e0: number, e1: number, weight: number): number =>
  ((64 - weight) * e0 + weight * e1 + 32) >> 6;

/**
 * Decodes one 4x4 block into 16 RGBA texels, row by row
 */
const decodeBlock = (
  data: Uint8Array,
  offset: number,
  out: Uint8Array,
): void => {
  for (let word = 0; word < 4; word++) {
    const at = offset + word * 4;
    words[word] =
      (data[at]! |
        (data[at + 1]! << 8) |
        (data[at + 2]! << 16) |
        (data[at + 3]! << 24)) >>>
      0;
  }

  // The mode corresponds to the position of the lowest set bit
  const first = data[offset]!;
  if (first === 0) {
    // Reserved mode; decoders output transparent black per specification
    out.fill(0);
    return;
  }
  let mode = 0;
  while (((first >> mode) & 1) === 0) {
    mode++;
  }
  bitPosition = mode + 1;

  let partition = 0;
  let subsetCount = 1;
  if (mode === 0 || mode === 1 || mode === 2 || mode === 3 || mode === 7) {
    subsetCount = mode === 0 || mode === 2 ? 3 : 2;
    partition = readBits(mode === 0 ? 4 : 6);
  }
  let rotation = 0;
  let indexSelection = 0;
  if (mode === 4 || mode === 5) {
    rotation = readBits(2);
    if (mode === 4) {
      indexSelection = readBits(1);
    }
  }

  const endpointCount = subsetCount * 2;
  const colorBits = COLOR_BITS[mode]!;
  const alphaBits = ALPHA_BITS[mode]!;
  for (let channel = 0; channel < 3; channel++) {
    for (let endpoint = 0; endpoint < endpointCount; endpoint++) {
      endpoints[endpoint * 4 + channel] = readBits(colorBits);
    }
  }
  for (let endpoint = 0; endpoint < endpointCount; endpoint++) {
    endpoints[endpoint * 4 + 3] = alphaBits > 0 ? readBits(alphaBits) : 0;
  }

  const hasPBits = (MODE_HAS_PBITS >> mode) & 1;
  if (hasPBits) {
    if (mode === 1) {
      // One p-bit per subset, for its colour only
      const pBits = [readBits(1), readBits(1)];
      for (let endpoint = 0; endpoint < 4; endpoint++) {
        for (let channel = 0; channel < 4; channel++) {
          endpoints[endpoint * 4 + channel] =
            (endpoints[endpoint * 4 + channel]! << 1) |
            (channel < 3 ? pBits[endpoint >> 1]! : 0);
        }
      }
    } else {
      for (let endpoint = 0; endpoint < endpointCount; endpoint++) {
        const pBit = readBits(1);
        for (let channel = 0; channel < 4; channel++) {
          endpoints[endpoint * 4 + channel] =
            (endpoints[endpoint * 4 + channel]! << 1) | pBit;
        }
      }
    }
  }

  const colorPrecision = colorBits + hasPBits;
  const alphaPrecision = alphaBits + hasPBits;
  for (let endpoint = 0; endpoint < endpointCount; endpoint++) {
    for (let channel = 0; channel < 3; channel++) {
      // Bit-replicate component values to 8 bits by aligning to MSB and repeating high bits
      const value = endpoints[endpoint * 4 + channel]! << (8 - colorPrecision);
      endpoints[endpoint * 4 + channel] = value | (value >> colorPrecision);
    }
    if (alphaBits > 0) {
      const value = endpoints[endpoint * 4 + 3]! << (8 - alphaPrecision);
      endpoints[endpoint * 4 + 3] = value | (value >> alphaPrecision);
    } else {
      endpoints[endpoint * 4 + 3] = 0xff;
    }
  }

  const indexBits = mode === 0 || mode === 1 ? 3 : mode === 6 ? 4 : 2;
  const indexBits2 = mode === 4 ? 3 : mode === 5 ? 2 : 0;
  const weights =
    indexBits === 2 ? WEIGHTS_2 : indexBits === 3 ? WEIGHTS_3 : WEIGHTS_4;
  const weights2 = indexBits2 === 2 ? WEIGHTS_2 : WEIGHTS_3;

  const subsets = subsetCount === 3 ? SUBSETS_3 : SUBSETS_2;
  const subsetBase = partition * 16;
  // Non-zero anchor texels whose indices are stored with one fewer bit
  const anchor1 =
    subsetCount === 2
      ? ANCHORS_2[partition]!
      : subsetCount === 3
        ? ANCHORS_3[partition * 2]!
        : -1;
  const anchor2 = subsetCount === 3 ? ANCHORS_3[partition * 2 + 1]! : -1;

  // Color indices for all texels precede alpha indices
  for (let texel = 0; texel < 16; texel++) {
    const isAnchor = texel === 0 || texel === anchor1 || texel === anchor2;
    indices[texel] = readBits(isAnchor ? indexBits - 1 : indexBits);
  }

  for (let texel = 0; texel < 16; texel++) {
    const subset = subsetCount === 1 ? 0 : subsets[subsetBase + texel]!;
    const e0 = subset * 8;
    const e1 = e0 + 4;
    let colorWeight = weights[indices[texel]!]!;
    let alphaWeight = colorWeight;
    if (indexBits2 > 0) {
      const index2 = readBits(texel === 0 ? indexBits2 - 1 : indexBits2);
      if (indexSelection === 0) {
        alphaWeight = weights2[index2]!;
      } else {
        colorWeight = weights2[index2]!;
      }
    }
    const target = texel * 4;
    for (let channel = 0; channel < 3; channel++) {
      out[target + channel] = interpolate(
        endpoints[e0 + channel]!,
        endpoints[e1 + channel]!,
        colorWeight,
      );
    }
    out[target + 3] = interpolate(
      endpoints[e0 + 3]!,
      endpoints[e1 + 3]!,
      alphaWeight,
    );
    if (rotation > 0) {
      // Swap rotated color channel with alpha
      const channel = target + rotation - 1;
      const alpha = out[target + 3]!;
      out[target + 3] = out[channel]!;
      out[channel] = alpha;
    }
  }
};

/**
 * Decodes a rectangle of a BC7 texture into RGBA, row by row, without decoding the rest of it
 */
export const decodeBc7Rect = (
  data: Uint8Array,
  textureWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array => {
  const blocksPerRow = Math.ceil(textureWidth / BLOCK_SIZE);
  const rgba = new Uint8Array(width * height * 4);
  const block = new Uint8Array(BLOCK_SIZE * BLOCK_SIZE * 4);
  const firstBlockX = Math.floor(x / BLOCK_SIZE);
  const lastBlockX = Math.floor((x + width - 1) / BLOCK_SIZE);
  const firstBlockY = Math.floor(y / BLOCK_SIZE);
  const lastBlockY = Math.floor((y + height - 1) / BLOCK_SIZE);
  // decodeBlock reads past the end as undefined, and its mode search never ends on that
  const needed =
    width > 0 && height > 0
      ? (lastBlockY * blocksPerRow + lastBlockX + 1) * BLOCK_BYTES
      : 0;
  if (needed > data.length) {
    throw new RangeError(
      `The BC7 texture is truncated, ${data.length} bytes hold less than the ${needed} the rectangle covers`,
    );
  }
  for (let blockY = firstBlockY; blockY <= lastBlockY; blockY++) {
    for (let blockX = firstBlockX; blockX <= lastBlockX; blockX++) {
      decodeBlock(data, (blockY * blocksPerRow + blockX) * BLOCK_BYTES, block);
      for (let row = 0; row < BLOCK_SIZE; row++) {
        const pixelY = blockY * BLOCK_SIZE + row - y;
        if (pixelY < 0 || pixelY >= height) {
          continue;
        }
        for (let column = 0; column < BLOCK_SIZE; column++) {
          const pixelX = blockX * BLOCK_SIZE + column - x;
          if (pixelX < 0 || pixelX >= width) {
            continue;
          }
          const source = (row * BLOCK_SIZE + column) * 4;
          const target = (pixelY * width + pixelX) * 4;
          rgba[target] = block[source]!;
          rgba[target + 1] = block[source + 1]!;
          rgba[target + 2] = block[source + 2]!;
          rgba[target + 3] = block[source + 3]!;
        }
      }
    }
  }
  return rgba;
};

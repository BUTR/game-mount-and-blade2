import { describe, expect, it } from "vitest";
import { decodeBc7Rect } from "./bc7";

type RGBA = [number, number, number, number];

/**
 * A 128-bit BC7 block, its fields written lowest bit first
 */
class Block {
  public readonly bytes = new Uint8Array(16);
  private position = 0;

  public bits = (value: number, count: number): this => {
    for (let bit = 0; bit < count; bit++) {
      if ((value >> bit) & 1) {
        const at = this.position + bit;
        this.bytes[at >> 3] = this.bytes[at >> 3]! | (1 << (at & 7));
      }
    }
    this.position += count;
    return this;
  };

  public done = (): Uint8Array => {
    expect(this.position).toBe(128);
    return this.bytes;
  };
}

const WEIGHTS_2 = [0, 21, 43, 64];
const WEIGHTS_3 = [0, 9, 18, 27, 37, 46, 55, 64];
const WEIGHTS_4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

const interpolate = (e0: number, e1: number, weight: number): number =>
  ((64 - weight) * e0 + weight * e1 + 32) >> 6;

/**
 * Mode 6: one subset, 7-bit RGBA endpoints with a p-bit each, 4-bit indices
 */
const mode6 = (
  e0: RGBA,
  p0: number,
  e1: RGBA,
  p1: number,
  indices: number[],
): Uint8Array => {
  const block = new Block().bits(1 << 6, 7);
  for (let channel = 0; channel < 4; channel++) {
    block.bits(e0[channel]!, 7).bits(e1[channel]!, 7);
  }
  block.bits(p0, 1).bits(p1, 1);
  indices.forEach((index, texel) => block.bits(index, texel === 0 ? 3 : 4));
  return block.done();
};

/**
 * Mode 5: one subset, 7-bit colors and 8-bit alphas, a channel rotation, 2-bit color and alpha indices
 */
const mode5 = (
  rotation: number,
  e0: RGBA,
  e1: RGBA,
  colorIndices: number[] = Array<number>(16).fill(0),
  alphaIndices: number[] = Array<number>(16).fill(0),
): Uint8Array => {
  const block = new Block().bits(1 << 5, 6).bits(rotation, 2);
  for (let channel = 0; channel < 3; channel++) {
    block.bits(e0[channel]!, 7).bits(e1[channel]!, 7);
  }
  block.bits(e0[3], 8).bits(e1[3], 8);
  colorIndices.forEach((index, texel) =>
    block.bits(index, texel === 0 ? 1 : 2),
  );
  alphaIndices.forEach((index, texel) =>
    block.bits(index, texel === 0 ? 1 : 2),
  );
  return block.done();
};

// 7-bit endpoints widen to 8 bits by repeating their top bit
const widen7 = (value: number): number => (value << 1) | (value >> 6);

/**
 * A block of one opaque color, from 7-bit components
 */
const solid = (r: number, g: number, b: number): Uint8Array =>
  mode5(0, [r, g, b, 255], [r, g, b, 255]);

const decodeBlock = (block: Uint8Array): RGBA[] => {
  const rgba = decodeBc7Rect(block, 4, 0, 0, 4, 4);
  return Array.from(
    { length: 16 },
    (_, texel) => [...rgba.subarray(texel * 4, texel * 4 + 4)] as RGBA,
  );
};

describe("decodeBc7Rect", () => {
  it("decodes a reserved mode block to transparent black", () => {
    expect(decodeBlock(new Uint8Array(16))).toEqual(
      Array<RGBA>(16).fill([0, 0, 0, 0]),
    );
  });

  it("decodes mode 6 endpoints with their p-bits and interpolates its 4-bit indices", () => {
    const indices = Array.from({ length: 16 }, (_, texel) => texel);
    indices[0] = 7;
    const block = mode6([10, 20, 30, 127], 0, [100, 110, 120, 0], 1, indices);

    const e0 = [20, 40, 60, 254];
    const e1 = [201, 221, 241, 1];
    expect(decodeBlock(block)).toEqual(
      indices.map((index) =>
        e0.map((value, channel) =>
          interpolate(value, e1[channel]!, WEIGHTS_4[index]!),
        ),
      ),
    );
  });

  it("decodes mode 5 with 8-bit alpha and separate alpha indices", () => {
    const colorIndices = Array<number>(16).fill(3);
    colorIndices[0] = 1;
    const alphaIndices = Array.from({ length: 16 }, (_, texel) => texel % 4);
    alphaIndices[0] = 0;
    const block = mode5(
      0,
      [0, 64, 127, 200],
      [127, 0, 0, 10],
      colorIndices,
      alphaIndices,
    );

    const texels = decodeBlock(block);

    expect(texels[0]).toEqual([
      interpolate(0, 255, WEIGHTS_2[1]!),
      interpolate(129, 0, WEIGHTS_2[1]!),
      interpolate(255, 0, WEIGHTS_2[1]!),
      200,
    ]);
    expect(texels.slice(1).map((texel) => texel.slice(0, 3))).toEqual(
      Array(15).fill([255, 0, 0]),
    );
    expect(texels.slice(1).map((texel) => texel[3])).toEqual(
      alphaIndices
        .slice(1)
        .map((index) => interpolate(200, 10, WEIGHTS_2[index]!)),
    );
  });

  it.each([
    [1, [10, 129, 0, 255]],
    [2, [255, 10, 0, 129]],
    [3, [255, 129, 10, 0]],
  ])("swaps alpha with the channel of rotation %i", (rotation, expected) => {
    const block = mode5(rotation, [127, 64, 0, 10], [127, 64, 0, 10]);

    expect(decodeBlock(block)).toEqual(Array(16).fill(expected));
  });

  it("decodes mode 4 with the 3-bit indices for color when its index selection bit is set", () => {
    const block = new Block()
      .bits(1 << 4, 5)
      .bits(0, 2)
      .bits(1, 1);
    // 5-bit colors, black to white, then 6-bit alphas, transparent to opaque
    for (let channel = 0; channel < 3; channel++) {
      block.bits(0, 5).bits(31, 5);
    }
    block.bits(0, 6).bits(63, 6);
    const twoBit = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 ? 1 : 3,
    );
    const threeBit = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 ? 3 : texel % 8,
    );
    twoBit.forEach((index, texel) => block.bits(index, texel === 0 ? 1 : 2));
    threeBit.forEach((index, texel) => block.bits(index, texel === 0 ? 2 : 3));

    const texels = decodeBlock(block.done());

    expect(texels).toEqual(
      threeBit.map((index, texel) => {
        const color = interpolate(0, 255, WEIGHTS_3[index]!);
        return [
          color,
          color,
          color,
          interpolate(0, 255, WEIGHTS_2[twoBit[texel]!]!),
        ];
      }),
    );
  });

  it("decodes mode 1's two subsets by the partition, with an anchor index a bit shorter", () => {
    // Partition 13: the top two rows are subset 0, the bottom two subset 1, whose anchor is texel 15
    const block = new Block().bits(1 << 1, 2).bits(13, 6);
    const endpoints = [63, 0, 0, 63];
    for (let channel = 0; channel < 3; channel++) {
      endpoints.forEach((value) => block.bits(value, 6));
    }
    // One p-bit per subset
    block.bits(1, 1).bits(1, 1);
    const indices = Array.from({ length: 16 }, (_, texel) =>
      texel < 8 ? 0 : texel === 15 ? 3 : 7,
    );
    indices.forEach((index, texel) =>
      block.bits(index, texel === 0 || texel === 15 ? 2 : 3),
    );

    const texels = decodeBlock(block.done());

    const subset1 = (index: number): number =>
      interpolate(2, 255, WEIGHTS_3[index]!);
    expect(texels).toEqual(
      indices.map((index, texel) => {
        const value = texel < 8 ? 255 : subset1(index);
        return [value, value, value, 255];
      }),
    );
  });

  it("decodes mode 2's three subsets with two shorter anchor indices", () => {
    // Partition 0: "0011001102212222", subsets 1 and 2 anchored at texels 3 and 15
    const block = new Block().bits(1 << 2, 3).bits(0, 6);
    const endpoints = [0, 0, 31, 31, 0, 31];
    for (let channel = 0; channel < 3; channel++) {
      endpoints.forEach((value) => block.bits(value, 5));
    }
    const indices = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 || texel === 3 || texel === 15 ? 1 : 2,
    );
    indices.forEach((index, texel) =>
      block.bits(index, texel === 0 || texel === 3 || texel === 15 ? 1 : 2),
    );

    const texels = decodeBlock(block.done());

    const subsets = "0011001102212222";
    const ranges = [
      [0, 0],
      [255, 255],
      [0, 255],
    ];
    expect(texels).toEqual(
      indices.map((index, texel) => {
        const [e0, e1] = ranges[Number(subsets[texel])]!;
        const value = interpolate(e0!, e1!, WEIGHTS_2[index]!);
        return [value, value, value, 255];
      }),
    );
  });

  it("decodes the blocks a rectangle overlaps and crops them to it", () => {
    const colors: RGBA[] = [
      [widen7(10), widen7(20), widen7(30), 255],
      [widen7(40), widen7(50), widen7(60), 255],
      [widen7(70), widen7(80), widen7(90), 255],
      [widen7(100), widen7(110), widen7(120), 255],
    ];
    const data = new Uint8Array(4 * 16);
    data.set(solid(10, 20, 30), 0);
    data.set(solid(40, 50, 60), 16);
    data.set(solid(70, 80, 90), 32);
    data.set(solid(100, 110, 120), 48);

    const rgba = decodeBc7Rect(data, 8, 2, 3, 4, 2);

    const expected = [0, 0, 1, 1, 2, 2, 3, 3].flatMap(
      (block) => colors[block]!,
    );
    expect([...rgba]).toEqual(expected);
  });

  it("rounds the blocks per row up for widths that aren't a multiple of 4", () => {
    const data = new Uint8Array(4 * 16);
    data.set(solid(127, 0, 0), 0);
    data.set(solid(0, 127, 0), 16);
    data.set(solid(0, 0, 127), 32);
    data.set(solid(127, 127, 127), 48);

    const rgba = decodeBc7Rect(data, 6, 4, 4, 2, 2);

    expect([...rgba]).toEqual(Array(4).fill([255, 255, 255, 255]).flat());
  });

  it("decodes mode 4 with the 2-bit indices for color and the 3-bit ones for alpha by default", () => {
    const block = new Block()
      .bits(1 << 4, 5)
      .bits(0, 2)
      .bits(0, 1);
    for (let channel = 0; channel < 3; channel++) {
      block.bits(0, 5).bits(31, 5);
    }
    block.bits(0, 6).bits(63, 6);
    const twoBit = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 ? 1 : texel % 4,
    );
    const threeBit = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 ? 3 : texel % 8,
    );
    twoBit.forEach((index, texel) => block.bits(index, texel === 0 ? 1 : 2));
    threeBit.forEach((index, texel) => block.bits(index, texel === 0 ? 2 : 3));

    const texels = decodeBlock(block.done());

    expect(texels).toEqual(
      twoBit.map((index, texel) => {
        const color = interpolate(0, 255, WEIGHTS_2[index]!);
        return [
          color,
          color,
          color,
          interpolate(0, 255, WEIGHTS_3[threeBit[texel]!]!),
        ];
      }),
    );
  });

  it("decodes mode 0's three subsets from a 4-bit partition, with a p-bit per endpoint", () => {
    // Partition 0: "0011001102212222", subsets 1 and 2 anchored at texels 3 and 15
    const block = new Block().bits(1, 1).bits(0, 4);
    // Subset 0 goes 0 to 255, subset 1 255 to 0, subset 2 is 132 throughout (4 bits and the p-bit, widened)
    const colors = [0, 15, 15, 0, 8, 8];
    const pBits = [0, 1, 1, 0, 0, 0];
    for (let channel = 0; channel < 3; channel++) {
      colors.forEach((value) => block.bits(value, 4));
    }
    pBits.forEach((value) => block.bits(value, 1));
    const indices = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 || texel === 3 || texel === 15 ? 3 : texel % 8,
    );
    indices.forEach((index, texel) =>
      block.bits(index, texel === 0 || texel === 3 || texel === 15 ? 2 : 3),
    );

    const texels = decodeBlock(block.done());

    const subsets = "0011001102212222";
    const ranges = [
      [0, 255],
      [255, 0],
      [132, 132],
    ];
    expect(texels).toEqual(
      indices.map((index, texel) => {
        const [e0, e1] = ranges[Number(subsets[texel])]!;
        const value = interpolate(e0!, e1!, WEIGHTS_3[index]!);
        return [value, value, value, 255];
      }),
    );
  });

  it("decodes mode 3's 7-bit endpoints with a p-bit each and 2-bit indices", () => {
    // Partition 0: "0011001100110011", subset 1 anchored at texel 15
    const block = new Block().bits(1 << 3, 4).bits(0, 6);
    const colors = [0, 127, 127, 0];
    const pBits = [0, 1, 1, 0];
    for (let channel = 0; channel < 3; channel++) {
      colors.forEach((value) => block.bits(value, 7));
    }
    pBits.forEach((value) => block.bits(value, 1));
    const indices = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 || texel === 15 ? 1 : texel % 4,
    );
    indices.forEach((index, texel) =>
      block.bits(index, texel === 0 || texel === 15 ? 1 : 2),
    );

    const texels = decodeBlock(block.done());

    const subsets = "0011001100110011";
    const ranges = [
      [0, 255],
      [255, 0],
    ];
    expect(texels).toEqual(
      indices.map((index, texel) => {
        const [e0, e1] = ranges[Number(subsets[texel])]!;
        const value = interpolate(e0!, e1!, WEIGHTS_2[index]!);
        return [value, value, value, 255];
      }),
    );
  });

  it("decodes mode 7's 5-bit colors and alphas, the p-bit shared by all four channels", () => {
    // Partition 1: "0001000100010001", subset 1 anchored at texel 15
    const block = new Block().bits(1 << 7, 8).bits(1, 6);
    const colors = [0, 31, 16, 16];
    const alphas = [31, 0, 16, 16];
    const pBits = [1, 1, 0, 0];
    for (let channel = 0; channel < 3; channel++) {
      colors.forEach((value) => block.bits(value, 5));
    }
    alphas.forEach((value) => block.bits(value, 5));
    pBits.forEach((value) => block.bits(value, 1));
    const indices = Array.from({ length: 16 }, (_, texel) =>
      texel === 0 || texel === 15 ? 1 : 2,
    );
    indices.forEach((index, texel) =>
      block.bits(index, texel === 0 || texel === 15 ? 1 : 2),
    );

    const texels = decodeBlock(block.done());

    // 6 bits with the p-bit, widened: 0b000001 is 4, 0b111111 is 255, 0b100000 is 130
    const subsets = "0001000100010001";
    expect(texels).toEqual(
      indices.map((index, texel) => {
        if (subsets[texel] === "1") {
          return [130, 130, 130, 130];
        }
        const color = interpolate(4, 255, WEIGHTS_2[index]!);
        return [color, color, color, interpolate(255, 4, WEIGHTS_2[index]!)];
      }),
    );
  });

  it("decodes nothing for an empty rectangle", () => {
    expect(decodeBc7Rect(solid(127, 0, 0), 4, 0, 0, 0, 0)).toEqual(
      new Uint8Array(0),
    );
  });

  it("fails for data shorter than the blocks the rectangle covers, instead of hanging", () => {
    expect(() => decodeBc7Rect(new Uint8Array(0), 4, 0, 0, 4, 4)).toThrow(
      "truncated",
    );
    // Two blocks per row, the rectangle is the second row's first block: the third block
    expect(() => decodeBc7Rect(new Uint8Array(32), 8, 0, 4, 4, 4)).toThrow(
      "truncated",
    );
    // All zero is the reserved mode, transparent black
    expect(decodeBc7Rect(new Uint8Array(48), 8, 0, 4, 4, 4)).toEqual(
      new Uint8Array(64),
    );
  });
});

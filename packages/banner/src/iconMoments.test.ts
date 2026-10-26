import { describe, expect, it } from "vitest";
import { inflateSync } from "zlib";
import {
  clamp01,
  colorIcon,
  computeIconMoments,
  ICON_RESOLUTION,
  MOMENT_CHANNELS,
  toLinear,
} from "./iconMoments";
import { ITpacTexture } from "@bannerlord/tpac";

const PIXELS = ICON_RESOLUTION * ICON_RESOLUTION;
const SCALE = 0xffff;

/**
 * A BC7 mode 5 block: 7-bit colors, 8-bit alphas, the alpha of each column picked by `alphaIndices`
 */
const mode5Block = (
  color: [number, number, number],
  alpha0: number,
  alpha1: number,
  columnAlphaIndices: [number, number, number, number] = [0, 0, 0, 0],
): Uint8Array => {
  const bytes = new Uint8Array(16);
  let position = 0;
  const bits = (value: number, count: number): void => {
    for (let bit = 0; bit < count; bit++, position++) {
      if ((value >> bit) & 1) {
        bytes[position >> 3] = bytes[position >> 3]! | (1 << (position & 7));
      }
    }
  };
  bits(1 << 5, 6);
  bits(0, 2);
  color.forEach((value) => {
    bits(value, 7);
    bits(value, 7);
  });
  bits(alpha0, 8);
  bits(alpha1, 8);
  bits(0, 31);
  for (let texel = 0; texel < 16; texel++) {
    bits(columnAlphaIndices[texel % 4]!, texel === 0 ? 1 : 2);
  }
  return bytes;
};

const atlas = (
  width: number,
  blockAt: (blockX: number, blockY: number) => Uint8Array | undefined,
): ITpacTexture => {
  const blocksPerRow = width / 4;
  const pixels = new Uint8Array(blocksPerRow * blocksPerRow * 16);
  for (let blockY = 0; blockY < blocksPerRow; blockY++) {
    for (let blockX = 0; blockX < blocksPerRow; blockX++) {
      const block = blockAt(blockX, blockY);
      if (block !== undefined) {
        pixels.set(block, (blockY * blocksPerRow + blockX) * 16);
      }
    }
  }
  return { width, height: width, format: "BC7", pixels };
};

const channel = (moments: Uint16Array, index: number): number[] => [
  ...new Set(moments.subarray(index * PIXELS, (index + 1) * PIXELS)),
];

const toSrgb = (value: number): number =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

const decodeDataUrl = (url: string): Uint8Array => {
  const prefix = "data:image/png;base64,";
  expect(url.startsWith(prefix)).toBe(true);
  const png = Buffer.from(url.slice(prefix.length), "base64");
  let position = 8;
  const idat: Buffer[] = [];
  while (position < png.length) {
    const length = png.readUInt32BE(position);
    if (png.toString("ascii", position + 4, position + 8) === "IDAT") {
      idat.push(png.subarray(position + 8, position + 8 + length));
    }
    position += 12 + length;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const stride = ICON_RESOLUTION * 4;
  const rgba = new Uint8Array(PIXELS * 4);
  for (let y = 0; y < ICON_RESOLUTION; y++) {
    rgba.set(
      rows.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
      y * stride,
    );
  }
  return rgba;
};

const distinctPixels = (rgba: Uint8Array): number[][] => [
  ...new Map(
    Array.from({ length: PIXELS }, (_, pixel) => {
      const value = [...rgba.subarray(pixel * 4, pixel * 4 + 4)];
      return [value.join(","), value] as const;
    }),
  ).values(),
];

const moments = (
  values: Partial<Record<"ar" | "ag" | "arr" | "arg" | "agg", number>>,
): Uint16Array => {
  const result = new Uint16Array(MOMENT_CHANNELS * PIXELS);
  (["ar", "ag", "arr", "arg", "agg"] as const).forEach((name, index) =>
    result.fill(values[name] ?? 0, index * PIXELS, (index + 1) * PIXELS),
  );
  return result;
};

describe("toLinear and clamp01", () => {
  it("converts sRGB to linear with the linear toe and the power curve", () => {
    expect(toLinear(0)).toBe(0);
    expect(toLinear(1)).toBeCloseTo(1, 12);
    expect(toLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
    expect(toLinear(0.5)).toBeCloseTo(0.214041, 6);
  });

  it("clamps to [0, 1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe("computeIconMoments", () => {
  it("takes the cell's texels from its row and column of the atlas", () => {
    // Cell 5 is the second cell of the second row: blocks 32 to 63 of a 512 pixel atlas
    const texture = atlas(512, (x, y) =>
      x >= 32 && x < 64 && y >= 32 && y < 64
        ? mode5Block([127, 64, 0], 255, 255)
        : undefined,
    );

    const result = computeIconMoments(texture, 5);

    const g = Math.fround(toLinear(129 / 255));
    expect(result.length).toBe(MOMENT_CHANNELS * PIXELS);
    expect(channel(result, 0)).toEqual([SCALE]);
    expect(channel(result, 1)).toEqual([Math.round(g * SCALE)]);
    expect(channel(result, 2)).toEqual([SCALE]);
    expect(channel(result, 3)).toEqual([Math.round(g * SCALE)]);
    expect(channel(result, 4)).toEqual([Math.round(g * g * SCALE)]);
  });

  it("is zero where the cell is transparent", () => {
    const texture = atlas(512, (x, y) =>
      x >= 32 && x < 64 && y >= 32 && y < 64
        ? mode5Block([127, 127, 127], 255, 255)
        : undefined,
    );

    const result = computeIconMoments(texture, 0);

    expect([...new Set(result)]).toEqual([0]);
  });

  it("averages the texels each pixel of a larger cell covers", () => {
    // Every other column is transparent, a 1024 pixel atlas has 256 pixel cells, 2x2 texels a pixel
    const texture = atlas(1024, () =>
      mode5Block([0, 127, 0], 255, 0, [0, 3, 0, 3]),
    );

    const result = computeIconMoments(texture, 15);

    expect(channel(result, 0)).toEqual([0]);
    expect(channel(result, 1)).toEqual([Math.round(0.5 * SCALE)]);
    expect(channel(result, 3)).toEqual([0]);
    expect(channel(result, 4)).toEqual([Math.round(0.5 * SCALE)]);
  });
});

describe("colorIcon", () => {
  const FILL: [number, number, number] = [181, 122, 30];
  const STROKE: [number, number, number] = [20, 200, 90];

  it("paints the green channel's coverage with the fill color", () => {
    const icon = colorIcon(
      moments({ ag: SCALE, agg: SCALE }),
      FILL,
      STROKE,
      true,
    );

    expect(distinctPixels(decodeDataUrl(icon))).toEqual([[...FILL, 255]]);
  });

  it("paints the red channel's coverage with the stroke color when the stroke is drawn", () => {
    const outline = moments({ ar: SCALE, arr: SCALE });

    expect(
      distinctPixels(decodeDataUrl(colorIcon(outline, FILL, STROKE, true))),
    ).toEqual([[...STROKE, 255]]);
    expect(
      distinctPixels(decodeDataUrl(colorIcon(outline, FILL, STROKE, false))),
    ).toEqual([[0, 0, 0, 0]]);
  });

  it("keeps partial coverage in the alpha, not in the color", () => {
    const half = Math.round(SCALE / 2);
    const icon = colorIcon(
      moments({ ag: half, agg: half }),
      FILL,
      STROKE,
      false,
    );

    expect(distinctPixels(decodeDataUrl(icon))).toEqual([[...FILL, 128]]);
  });

  it("blends stroke and fill in linear space", () => {
    const half = Math.round(SCALE / 2);
    const icon = colorIcon(
      moments({ ar: half, ag: half, arr: half, agg: half }),
      [0, 0, 0],
      [255, 255, 255],
      true,
    );

    const gray = Math.round(toSrgb(0.5) * 255);
    expect(gray).toBe(188);
    expect(distinctPixels(decodeDataUrl(icon))).toEqual([
      [gray, gray, gray, 255],
    ]);
  });

  it("clamps stroke and fill covering the same pixel to opaque", () => {
    // Both channels fully covering: the alpha would be 2
    const icon = colorIcon(
      moments({ ar: SCALE, ag: SCALE, arr: SCALE, arg: SCALE, agg: SCALE }),
      [255, 255, 255],
      [255, 255, 255],
      true,
    );

    expect(distinctPixels(decodeDataUrl(icon))).toEqual([[255, 255, 255, 255]]);
  });

  it("is transparent black where the icon has no coverage", () => {
    const icon = colorIcon(moments({}), FILL, STROKE, true);

    expect(distinctPixels(decodeDataUrl(icon))).toEqual([[0, 0, 0, 0]]);
  });
});

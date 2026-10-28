import { RGB } from "./bannerIcons";
import { decodeBc7Rect } from "./bc7";
import { encodePng } from "./png";
import { ITpacTexture } from "@bannerlord/tpac";

// Number of rows/columns in icon texture atlases (BannerVisual.ConvertToMultiMesh uses 4x4 atlases)
export const ATLAS_CELLS = 4;
// Downsampled resolution for rendered icon sprites (original atlas cells are 512x512). Banners are shown at most
// 56px wide, an icon filling the view needs about this much on a 2x display
export const ICON_RESOLUTION = 128;
export const MOMENT_CHANNELS = 5;
const PIXELS = ICON_RESOLUTION * ICON_RESOLUTION;
// Moments are averages in [0, 1]. 16 bits render the same as floats within rounding, 8 bits are off by up to 10/255
const MOMENT_SCALE = 0xffff;

/**
 * Downsampled linear color moment statistics for an icon atlas cell: averages of alpha·r, alpha·g, alpha·r·r,
 * alpha·r·g and alpha·g·g, each channel ICON_RESOLUTION² values in that order, scaled to 16 bits.
 * Precomputing moments of texel channels (alpha, red, green) allows fast tinting and stroke
 * composition across arbitrary color combinations without re-decoding BC7 texture blocks.
 */
export type IconMoments = Uint16Array;

export const toLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const toSrgb = (value: number): number =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

// Precomputed sRGB-to-linear conversion table (matching shader INPUT_TEX_GAMMA)
const LINEAR_BYTES = Float32Array.from({ length: 256 }, (_, byte) =>
  toLinear(byte / 255),
);

export const clamp01 = (value: number): number =>
  Math.min(Math.max(value, 0), 1);

/**
 * The moments of an atlas cell, decoded from the atlas's BC7 blocks
 */
export const computeIconMoments = (
  atlas: ITpacTexture,
  textureIndex: number,
): IconMoments => {
  const cellSize = atlas.width / ATLAS_CELLS;
  const rgba = decodeBc7Rect(
    atlas.pixels,
    atlas.width,
    (textureIndex % ATLAS_CELLS) * cellSize,
    Math.floor(textureIndex / ATLAS_CELLS) * cellSize,
    cellSize,
    cellSize,
  );
  const sums = new Float64Array(MOMENT_CHANNELS * PIXELS);
  const scale = cellSize / ICON_RESOLUTION;
  const weight = 1 / (scale * scale);
  for (let y = 0; y < cellSize; y++) {
    const row = Math.floor(y / scale) * ICON_RESOLUTION;
    for (let x = 0; x < cellSize; x++) {
      const source = (y * cellSize + x) * 4;
      const r = LINEAR_BYTES[rgba[source]!]!;
      const g = LINEAR_BYTES[rgba[source + 1]!]!;
      const a = (rgba[source + 3]! / 255) * weight;
      const target = row + Math.floor(x / scale);
      sums[target] = sums[target]! + a * r;
      sums[PIXELS + target] = sums[PIXELS + target]! + a * g;
      sums[2 * PIXELS + target] = sums[2 * PIXELS + target]! + a * r * r;
      sums[3 * PIXELS + target] = sums[3 * PIXELS + target]! + a * r * g;
      sums[4 * PIXELS + target] = sums[4 * PIXELS + target]! + a * g * g;
    }
  }
  return Uint16Array.from(sums, (value) =>
    Math.round(clamp01(value) * MOMENT_SCALE),
  );
};

/**
 * Tints an icon cell matching the `gui_color_and_stroke` shader.
 * Atlas green channel represents the primary fill; atlas red channel represents outlines and internal accents.
 * Computes premultiplied alpha in linear space and encodes the result to a PNG data URL.
 */
export const colorIcon = (
  moments: IconMoments,
  color: RGB,
  strokeColor: RGB,
  drawStroke: boolean,
): string => {
  const fill = color.map((channel) => toLinear(channel / 255));
  const outline = strokeColor.map((channel) => toLinear(channel / 255));
  const stroke = drawStroke ? 1 : 0;

  const output = new Uint8Array(PIXELS * 4);
  for (let pixel = 0; pixel < PIXELS; pixel++) {
    const ar = moments[pixel]! / MOMENT_SCALE;
    const ag = moments[PIXELS + pixel]! / MOMENT_SCALE;
    const arr = moments[2 * PIXELS + pixel]! / MOMENT_SCALE;
    const arg = moments[3 * PIXELS + pixel]! / MOMENT_SCALE;
    const agg = moments[4 * PIXELS + pixel]! / MOMENT_SCALE;
    const alpha = stroke * ar + ag;
    // The averages of alpha·r and alpha·g
    const alphaR = stroke * arr + arg;
    const alphaG = stroke * arg + agg;
    const target = pixel * 4;
    for (let channel = 0; channel < 3; channel++) {
      output[target + channel] =
        alpha > 0
          ? Math.round(
              toSrgb(
                clamp01(
                  (outline[channel]! * alphaR + fill[channel]! * alphaG) /
                    alpha,
                ),
              ) * 255,
            )
          : 0;
    }
    output[target + 3] = Math.round(clamp01(alpha) * 255);
  }
  const png = encodePng(output, ICON_RESOLUTION, ICON_RESOLUTION);
  return `data:image/png;base64,${png.toString("base64")}`;
};

import { IBannerAssets, IBannerBackgroundMesh } from "./assets";
import { RGB } from "./bannerIcons";
import { decodeBc7Rect } from "./bc7";
import { BANNER_SIZE, IBannerLayer, parseBannerCode } from "./code";
import { encodePng } from "./png";
import { ITpacTexture } from "./tpac";

// Fallback RGB for undefined color IDs, matching BannerManager.GetColor (0xDEADBEEF)
const MISSING_COLOR: RGB = [0xad, 0xbe, 0xef];
// Number of rows/columns in icon texture atlases (BannerVisual.ConvertToMultiMesh uses 4x4 atlases)
const ATLAS_CELLS = 4;
// Downsampled resolution for rendered icon sprites (original atlas cells are 512x512)
const ICON_RESOLUTION = 128;

export type BannerShape =
  | {
      kind: "background";
      layer: IBannerLayer;
      /**
       * Mesh bounding box dimensions used to scale the layer.
       */
      width: number;
      height: number;
      /**
       * SVG path definitions in mesh units (Y-inverted for SVG, ordered back-to-front).
       */
      paths: { d: string; color: string }[];
    }
  | {
      kind: "icon";
      layer: IBannerLayer;
      /**
       * Base64 PNG data URL of the atlas cell tinted with the layer's colors.
       */
      href: string;
    };

const toLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const toSrgb = (value: number): number =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

// Precomputed sRGB-to-linear conversion table (matching shader INPUT_TEX_GAMMA)
const LINEAR_BYTES = Float32Array.from({ length: 256 }, (_, byte) =>
  toLinear(byte / 255),
);

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const toHex = (color: RGB): string =>
  `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

const getColor = (assets: IBannerAssets, id: number): RGB =>
  assets.colors.get(id) ?? MISSING_COLOR;

/**
 * Generates SVG paths for background meshes matching the `banner_background_color` shader:
 * linearly interpolates between Color2 (primary) and Color (secondary) based on vertex red channel.
 */
const backgroundPaths = (
  mesh: IBannerBackgroundMesh,
  color: RGB,
  color2: RGB,
): { d: string; color: string }[] => {
  // Batch triangles by depth (Z) and color into unified SVG paths to prevent visible seam artifacts
  const groups = new Map<string, { z: number; color: string; d: string[] }>();
  for (const triangle of mesh.triangles) {
    const fill = toHex(
      color2.map(
        (channel, index) =>
          channel + (color[index]! - channel) * triangle.shade,
      ) as RGB,
    );
    const key = `${triangle.z}:${fill}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { z: triangle.z, color: fill, d: [] };
      groups.set(key, group);
    }
    // Convert from mesh Y-up space to SVG Y-down space
    group.d.push(
      `M${triangle.points.map(([x, y]) => `${x} ${-y}`).join("L")}Z`,
    );
  }
  // Sort back-to-front along the Z axis so closer geometry renders on top
  return [...groups.values()]
    .sort((a, b) => a.z - b.z)
    .map((group) => ({ d: group.d.join(""), color: group.color }));
};

/**
 * Downsampled linear color moment statistics for an icon atlas cell.
 * Precomputing moments of texel channels (alpha, red, green) allows fast tinting and stroke
 * composition across arbitrary color combinations without re-decoding BC7 texture blocks.
 */
interface IIconMoments {
  ar: Float32Array;
  ag: Float32Array;
  arr: Float32Array;
  arg: Float32Array;
  agg: Float32Array;
}

const readIconMoments = (
  atlas: ITpacTexture,
  textureIndex: number,
): IIconMoments => {
  const cellSize = atlas.width / ATLAS_CELLS;
  const rgba = decodeBc7Rect(
    atlas.pixels,
    atlas.width,
    (textureIndex % ATLAS_CELLS) * cellSize,
    Math.floor(textureIndex / ATLAS_CELLS) * cellSize,
    cellSize,
    cellSize,
  );
  const pixels = ICON_RESOLUTION * ICON_RESOLUTION;
  const moments: IIconMoments = {
    ar: new Float32Array(pixels),
    ag: new Float32Array(pixels),
    arr: new Float32Array(pixels),
    arg: new Float32Array(pixels),
    agg: new Float32Array(pixels),
  };
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
      moments.ar[target] = moments.ar[target]! + a * r;
      moments.ag[target] = moments.ag[target]! + a * g;
      moments.arr[target] = moments.arr[target]! + a * r * r;
      moments.arg[target] = moments.arg[target]! + a * r * g;
      moments.agg[target] = moments.agg[target]! + a * g * g;
    }
  }
  return moments;
};

/**
 * Tints an icon cell matching the `gui_color_and_stroke` shader.
 * Atlas green channel represents the primary fill; atlas red channel represents outlines and internal accents.
 * Computes premultiplied alpha in linear space and encodes the result to a PNG data URL.
 */
const colorIcon = (
  moments: IIconMoments,
  color: RGB,
  strokeColor: RGB,
  drawStroke: boolean,
): string => {
  const fill = color.map((channel) => toLinear(channel / 255));
  const outline = strokeColor.map((channel) => toLinear(channel / 255));
  const stroke = drawStroke ? 1 : 0;

  const output = new Uint8Array(ICON_RESOLUTION * ICON_RESOLUTION * 4);
  for (let pixel = 0; pixel < ICON_RESOLUTION * ICON_RESOLUTION; pixel++) {
    const ar = moments.ar[pixel]!;
    const ag = moments.ag[pixel]!;
    const arg = moments.arg[pixel]!;
    const alpha = stroke * ar + ag;
    // The averages of alpha·r and alpha·g
    const alphaR = stroke * moments.arr[pixel]! + arg;
    const alphaG = stroke * arg + moments.agg[pixel]!;
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

const momentsCache = new WeakMap<ITpacTexture, Map<number, IIconMoments>>();

const getIconMoments = (
  atlas: ITpacTexture,
  textureIndex: number,
): IIconMoments => {
  let cells = momentsCache.get(atlas);
  if (cells === undefined) {
    cells = new Map();
    momentsCache.set(atlas, cells);
  }
  let moments = cells.get(textureIndex);
  if (moments === undefined) {
    moments = readIconMoments(atlas, textureIndex);
    cells.set(textureIndex, moments);
  }
  return moments;
};

const THIRD = BANNER_SIZE / 3;

/**
 * SVG viewBox corresponding to `BannerTextureCreator`'s default camera view:
 * frames the central third of the banner canvas (used for small in-game banner portraits).
 */
export const BANNER_VIEW_BOX = `${THIRD} ${THIRD} ${THIRD} ${THIRD}`;

/**
 * Converts `BannerVisual.GetMeshMatrix` into an SVG transform attribute string:
 * applies translation, rotation (counterclockwise), mirroring, and scaling.
 * (Icons use a unit square baseline; background meshes scale relative to their bounding box.)
 */
export const getShapeTransform = (shape: BannerShape): string => {
  const { layer } = shape;
  const width = shape.kind === "background" ? shape.width : 1;
  const height = shape.kind === "background" ? shape.height : 1;
  return [
    `translate(${layer.positionX} ${layer.positionY})`,
    `rotate(${-layer.rotation})`,
    `scale(${((layer.mirror ? -1 : 1) * layer.sizeX) / width} ${layer.sizeY / height})`,
  ].join(" ");
};

/**
 * The banner's primary color as a hex string, following `TaleWorlds.Core.Banner.GetPrimaryColor`: the background
 * layer's first color.
 *
 * @returns The color, or null if the banner code is invalid.
 */
export const getBannerPrimaryColor = (
  assets: IBannerAssets,
  code: string,
): string | null => {
  const background = parseBannerCode(code)?.[0];
  return background !== undefined
    ? toHex(getColor(assets, background.colorId))
    : null;
};

// Cache rendered icon data URLs by material/texture/colors since many banners share common icons
const iconCache = new WeakMap<IBannerAssets, Map<string, string>>();

/**
 * Renders banner code layers following `BannerVisual.ConvertToMultiMesh`:
 * layer 0 renders as a background mesh; subsequent layers render as atlas icon sprites.
 * Layers with missing mesh or material definitions are omitted.
 *
 * @returns An array of rendered shapes, or null if the banner code is invalid.
 */
export const renderBannerAsync = async (
  assets: IBannerAssets,
  code: string,
): Promise<BannerShape[] | null> => {
  const layers = parseBannerCode(code);
  if (layers === null) {
    return null;
  }
  let cache = iconCache.get(assets);
  if (cache === undefined) {
    cache = new Map();
    iconCache.set(assets, cache);
  }

  const shapes: BannerShape[] = [];
  for (const [index, layer] of layers.entries()) {
    const color = getColor(assets, layer.colorId);
    const color2 = getColor(assets, layer.colorId2);

    if (index === 0) {
      const meshName = assets.backgrounds.get(layer.meshId);
      const mesh =
        meshName !== undefined
          ? await assets.getBackgroundMeshAsync(meshName)
          : null;
      if (mesh !== null) {
        shapes.push({
          kind: "background",
          layer,
          width: mesh.width,
          height: mesh.height,
          paths: backgroundPaths(mesh, color, color2),
        });
      }
      continue;
    }

    const icon = assets.icons.get(layer.meshId);
    if (icon === undefined) {
      continue;
    }
    const key = [
      icon.materialName,
      icon.textureIndex,
      layer.colorId,
      layer.colorId2,
      layer.drawStroke,
    ].join(":");
    let href = cache.get(key);
    if (href === undefined) {
      const atlas = await assets.getMaterialTextureAsync(icon.materialName);
      if (atlas === null || atlas.format !== "BC7") {
        continue;
      }
      href = colorIcon(
        getIconMoments(atlas, icon.textureIndex),
        color,
        color2,
        layer.drawStroke,
      );
      cache.set(key, href);
    }
    shapes.push({ kind: "icon", layer, href });
  }
  return shapes;
};

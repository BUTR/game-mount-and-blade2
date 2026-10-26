import {
  IBannerAssets,
  IBannerBackgroundMesh,
  IBannerTextureSource,
} from "./assets";
import { IBannerIcon, RGB } from "./bannerIcons";
import { BANNER_SIZE, IBannerLayer, parseBannerCode } from "./code";
import { getCachedIconMomentsAsync } from "./iconCache";
import { colorIcon, computeIconMoments, IconMoments } from "./iconMoments";

// Fallback RGB for undefined color IDs, matching BannerManager.GetColor (0xDEADBEEF)
const MISSING_COLOR: RGB = [0xad, 0xbe, 0xef];

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

// The moments last drawn with, by texture and cell: a few icons make most banners. About 160 KB each
const MOMENTS_IN_MEMORY = 64;
const recentMoments = new Map<string, IconMoments>();

/**
 * Forgets the icons drawn so far, the game's files may have changed
 */
export const clearRecentIcons = (): void => {
  recentMoments.clear();
};

const rememberMoments = (key: string, moments: IconMoments): void => {
  recentMoments.delete(key);
  recentMoments.set(key, moments);
  if (recentMoments.size > MOMENTS_IN_MEMORY) {
    recentMoments.delete(recentMoments.keys().next().value!);
  }
};

/**
 * The moments of an icon: from memory, the disk cache in `cacheDir`, or decoded from its texture as the last resort
 */
const getIconMomentsAsync = async (
  assets: IBannerAssets,
  icon: IBannerIcon,
  cacheDir: string | undefined,
): Promise<IconMoments | null> => {
  const source = assets.getMaterialTextureSource(icon.materialName);
  if (source === null) {
    return null;
  }
  const key = `${source.filePath}|${source.guid}|${icon.textureIndex}`;
  const remembered = recentMoments.get(key);
  if (remembered !== undefined) {
    rememberMoments(key, remembered);
    return remembered;
  }
  // Banners drawn together share icons, one lookup each
  let loading = loadingMoments.get(key);
  if (loading === undefined) {
    loading = loadIconMomentsAsync(assets, icon, source, cacheDir).finally(() =>
      loadingMoments.delete(key),
    );
    loadingMoments.set(key, loading);
  }
  const moments = await loading;
  if (moments !== null) {
    rememberMoments(key, moments);
  }
  return moments;
};

const loadingMoments = new Map<string, Promise<IconMoments | null>>();

const loadIconMomentsAsync = async (
  assets: IBannerAssets,
  icon: IBannerIcon,
  source: IBannerTextureSource,
  cacheDir: string | undefined,
): Promise<IconMoments | null> => {
  const computeAsync = async (): Promise<IconMoments | null> => {
    const atlas = await assets.getMaterialTextureAsync(icon.materialName);
    return atlas !== null && atlas.format === "BC7"
      ? computeIconMoments(atlas, icon.textureIndex)
      : null;
  };
  return cacheDir !== undefined
    ? getCachedIconMomentsAsync(
        cacheDir,
        source,
        icon.textureIndex,
        computeAsync,
      )
    : computeAsync();
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

export interface IRenderBannerOptions {
  /**
   * Where the icons' moments are kept between sessions, see getCachedIconMomentsAsync. Without it every icon is
   * decoded from its texture
   */
  cacheDir?: string;
}

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
  options: IRenderBannerOptions = {},
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
      const moments = await getIconMomentsAsync(assets, icon, options.cacheDir);
      if (moments === null) {
        continue;
      }
      href = colorIcon(moments, color, color2, layer.drawStroke);
      cache.set(key, href);
    }
    shapes.push({ kind: "icon", layer, href });
  }
  return shapes;
};

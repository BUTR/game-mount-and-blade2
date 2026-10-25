/**
 * Canvas dimensions of a full banner, corresponding to `TaleWorlds.Core.Banner.BannerFullSize`.
 */
export const BANNER_SIZE = 1528;

const FIELDS_PER_LAYER = 10;

export interface IBannerLayer {
  /**
   * Background or Icon ID defined in banner_icons.xml.
   */
  meshId: number;
  colorId: number;
  colorId2: number;
  sizeX: number;
  sizeY: number;
  /**
   * Horizontal center coordinate of the layer.
   */
  positionX: number;
  /**
   * Vertical center coordinate of the layer.
   */
  positionY: number;
  drawStroke: boolean;
  mirror: boolean;
  /**
   * Rotation angle in degrees.
   */
  rotation: number;
}

/**
 * Parses a banner serialization string matching `TaleWorlds.Core.Banner.TryGetBannerDataFromCode`.
 * Each layer consists of ten dot-separated integers; the first layer defines the background.
 *
 * @returns An array of banner layers, or null if the code format is invalid.
 */
export const parseBannerCode = (code: string): IBannerLayer[] | null => {
  const fields = code.trim().split(".");
  if (fields.length < FIELDS_PER_LAYER) {
    return null;
  }
  const values = fields.map((field) =>
    /^-?\d+$/.test(field) ? parseInt(field, 10) : NaN,
  );
  const layers: IBannerLayer[] = [];
  for (
    let index = 0;
    index + FIELDS_PER_LAYER <= values.length;
    index += FIELDS_PER_LAYER
  ) {
    const layer = values.slice(index, index + FIELDS_PER_LAYER);
    if (layer.some((value) => isNaN(value))) {
      return null;
    }
    const [
      meshId,
      colorId,
      colorId2,
      sizeX,
      sizeY,
      positionX,
      positionY,
      drawStroke,
      mirror,
      rotation,
    ] = layer as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    layers.push({
      meshId,
      colorId,
      colorId2,
      sizeX,
      sizeY,
      positionX,
      positionY,
      drawStroke: drawStroke === 1,
      mirror: mirror === 1,
      rotation,
    });
  }
  return layers;
};

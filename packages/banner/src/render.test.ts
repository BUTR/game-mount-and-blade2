import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inflateSync } from "zlib";
import { IBannerAssets, IBannerBackgroundMesh } from "./assets";
import { IBannerIcon, RGB } from "./bannerIcons";
import { IBannerLayer } from "./code";
import {
  BannerShape,
  clearRecentIcons,
  getBannerPrimaryColor,
  getShapeTransform,
  renderBannerAsync,
} from "./render";
import { ITpacTexture } from "@bannerlord/tpac";

/**
 * A 512 pixel BC7 atlas of one opaque color, from 7-bit components (mode 5 blocks)
 */
const solidAtlas = (r: number, g: number, b: number): ITpacTexture => {
  const block = new Uint8Array(16);
  let position = 0;
  const bits = (value: number, count: number): void => {
    for (let bit = 0; bit < count; bit++, position++) {
      if ((value >> bit) & 1) {
        block[position >> 3] = block[position >> 3]! | (1 << (position & 7));
      }
    }
  };
  bits(1 << 5, 6);
  bits(0, 2);
  [r, g, b].forEach((value) => {
    bits(value, 7);
    bits(value, 7);
  });
  bits(255, 8);
  bits(255, 8);
  const pixels = new Uint8Array(128 * 128 * 16);
  for (let offset = 0; offset < pixels.length; offset += 16) {
    pixels.set(block, offset);
  }
  return { width: 512, height: 512, format: "BC7", pixels };
};

const GREEN_ATLAS = solidAtlas(0, 127, 0);

const COLORS = new Map<number, RGB>([
  [0, [255, 0, 0]],
  [1, [0, 0, 255]],
  [2, [181, 122, 30]],
  [3, [20, 200, 90]],
]);

const MESH: IBannerBackgroundMesh = {
  width: 2,
  height: 4,
  triangles: [
    {
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      shade: 1,
      z: 0,
    },
    {
      points: [
        [0, 0],
        [-1, 0],
        [0, -1],
      ],
      shade: 0,
      z: -1,
    },
    {
      points: [
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      shade: 1,
      z: 0,
    },
    {
      points: [
        [2, 2],
        [3, 2],
        [2, 3],
      ],
      shade: 0.5,
      z: 0.5,
    },
  ],
};

let packagePath = "core.tpac";

const makeAssets = (
  options: {
    icons?: Map<number, IBannerIcon>;
    loadTexture?: (name: string) => Promise<ITpacTexture | null>;
  } = {},
) => {
  const getMaterialTextureAsync = vi.fn(
    options.loadTexture ??
      ((name: string) =>
        Promise.resolve(
          name === "unknown_format"
            ? { ...GREEN_ATLAS, format: "unknown" as const }
            : GREEN_ATLAS,
        )),
  );
  const getBackgroundMeshAsync = vi.fn((name: string) =>
    Promise.resolve(name === "banner_background_test_1" ? MESH : null),
  );
  const assets: IBannerAssets = {
    colors: COLORS,
    icons:
      options.icons ??
      new Map([
        [100, { materialName: "custom_banner_icons_01", textureIndex: 0 }],
        [101, { materialName: "no_texture", textureIndex: 0 }],
        [102, { materialName: "unknown_format", textureIndex: 0 }],
      ]),
    backgrounds: new Map([
      [11, "banner_background_test_1"],
      [12, "missing_mesh"],
    ]),
    getMaterialTextureAsync,
    getMaterialTextureSource: (name) =>
      name === "no_texture" ? null : { filePath: packagePath, guid: name },
    getBackgroundMeshAsync,
  };
  return { assets, getMaterialTextureAsync, getBackgroundMeshAsync };
};

const layer = (
  meshId: number,
  colorId: number,
  colorId2: number,
  drawStroke = false,
): string =>
  [
    meshId,
    colorId,
    colorId2,
    493,
    493,
    764,
    764,
    drawStroke ? 1 : 0,
    0,
    0,
  ].join(".");

const BACKGROUND = "11.0.1.1528.1528.764.764.0.0.0";

/**
 * The first pixel of an icon's PNG data URL, the icons of a solid atlas are one color
 */
const firstPixel = (href: string): number[] => {
  const png = Buffer.from(
    href.slice("data:image/png;base64,".length),
    "base64",
  );
  const idatLength = png.readUInt32BE(33);
  const rows = inflateSync(png.subarray(41, 41 + idatLength));
  return [...rows.subarray(1, 5)];
};

const icons = (shapes: BannerShape[] | null) =>
  (shapes ?? []).flatMap((shape) => (shape.kind === "icon" ? [shape] : []));

beforeEach(() => {
  clearRecentIcons();
  packagePath = `core-${Math.random()}.tpac`;
});

describe("renderBannerAsync", () => {
  it("returns null for an invalid banner code", async () => {
    const { assets, getBackgroundMeshAsync } = makeAssets();

    expect(await renderBannerAsync(assets, "not a banner")).toBeNull();
    expect(getBackgroundMeshAsync).not.toHaveBeenCalled();
  });

  it("draws the background mesh's triangles grouped by depth and color, back to front", async () => {
    const { assets } = makeAssets();

    const shapes = await renderBannerAsync(assets, BACKGROUND);

    expect(shapes).toEqual([
      {
        kind: "background",
        layer: expect.objectContaining({ meshId: 11, colorId: 0, colorId2: 1 }),
        width: 2,
        height: 4,
        paths: [
          { d: "M0 0L-1 0L0 1Z", color: "#0000ff" },
          { d: "M0 0L1 0L0 -1ZM1 0L1 -1L0 -1Z", color: "#ff0000" },
          { d: "M2 -2L3 -2L2 -3Z", color: "#800080" },
        ],
      },
    ]);
  });

  it("draws undefined colors as the game's fallback color", async () => {
    const { assets } = makeAssets();

    const shapes = await renderBannerAsync(
      assets,
      "11.98.99.1528.1528.764.764.0.0.0",
    );

    expect(shapes![0]!.kind === "background" && shapes![0]!.paths).toEqual([
      { d: "M0 0L-1 0L0 1Z", color: "#adbeef" },
      { d: "M0 0L1 0L0 -1ZM1 0L1 -1L0 -1Z", color: "#adbeef" },
      { d: "M2 -2L3 -2L2 -3Z", color: "#adbeef" },
    ]);
  });

  it("leaves out a background without a mesh and still draws the icons", async () => {
    const { assets } = makeAssets();

    const unknownId = await renderBannerAsync(
      assets,
      `99.0.1.1528.1528.764.764.0.0.0.${layer(100, 2, 3)}`,
    );
    const missingMesh = await renderBannerAsync(
      assets,
      `12.0.1.1528.1528.764.764.0.0.0.${layer(100, 2, 3)}`,
    );

    expect(unknownId!.map((shape) => shape.kind)).toEqual(["icon"]);
    expect(missingMesh!.map((shape) => shape.kind)).toEqual(["icon"]);
  });

  it("draws icons from their atlas cell tinted with the layer's color", async () => {
    const { assets } = makeAssets();

    const shapes = await renderBannerAsync(
      assets,
      `${BACKGROUND}.${layer(100, 2, 3)}.${layer(100, 3, 2)}`,
    );

    const [first, second] = icons(shapes);
    expect(first!.layer.colorId).toBe(2);
    expect(firstPixel(first!.href)).toEqual([181, 122, 30, 255]);
    expect(firstPixel(second!.href)).toEqual([20, 200, 90, 255]);
  });

  it("leaves out icons without a definition, a texture or a BC7 texture", async () => {
    const { assets } = makeAssets();

    const shapes = await renderBannerAsync(
      assets,
      [
        BACKGROUND,
        layer(555, 2, 3),
        layer(101, 2, 3),
        layer(102, 2, 3),
        layer(100, 2, 3),
      ].join("."),
    );

    expect(icons(shapes).map((shape) => shape.layer.meshId)).toEqual([100]);
  });

  it("reuses an icon drawn with the same colors, its texture loaded once for any colors", async () => {
    const { assets, getMaterialTextureAsync } = makeAssets();
    const code = `${BACKGROUND}.${layer(100, 2, 3)}`;

    const [first] = icons(await renderBannerAsync(assets, code));
    const [again] = icons(await renderBannerAsync(assets, code));
    const [recolored] = icons(
      await renderBannerAsync(assets, `${BACKGROUND}.${layer(100, 3, 2)}`),
    );

    expect(again!.href).toBe(first!.href);
    expect(recolored!.href).not.toBe(first!.href);
    expect(getMaterialTextureAsync).toHaveBeenCalledOnce();
  });

  it("loads an icon once for banners drawn at the same time", async () => {
    const { assets, getMaterialTextureAsync } = makeAssets();

    await Promise.all([
      renderBannerAsync(assets, `${BACKGROUND}.${layer(100, 2, 3)}`),
      renderBannerAsync(assets, `${BACKGROUND}.${layer(100, 3, 2)}`),
    ]);

    expect(getMaterialTextureAsync).toHaveBeenCalledOnce();
  });

  it("keeps the 64 icons used last in memory, across assets", async () => {
    const iconIds = new Map(
      Array.from({ length: 65 }, (_, index) => [
        index,
        { materialName: `icons_${index}`, textureIndex: 0 },
      ]),
    );
    const loadTexture = vi.fn(() => Promise.resolve(GREEN_ATLAS));
    const renderIconAsync = (index: number) =>
      renderBannerAsync(
        makeAssets({ icons: iconIds, loadTexture }).assets,
        `${BACKGROUND}.${layer(index, 2, 3)}`,
      );
    for (let index = 0; index < 64; index++) {
      await renderIconAsync(index);
    }
    // Used again, icon 0 is now the most recent and icon 1 the least
    await renderIconAsync(0);
    await renderIconAsync(64);
    expect(loadTexture).toHaveBeenCalledTimes(65);
    loadTexture.mockClear();

    await renderIconAsync(0);
    expect(loadTexture).not.toHaveBeenCalled();
    await renderIconAsync(1);
    expect(loadTexture).toHaveBeenCalledWith("icons_1");
  });

  it("forgets the icons in memory when cleared", async () => {
    const loadTexture = vi.fn(() => Promise.resolve(GREEN_ATLAS));
    const code = `${BACKGROUND}.${layer(100, 2, 3)}`;
    await renderBannerAsync(makeAssets({ loadTexture }).assets, code);

    clearRecentIcons();
    await renderBannerAsync(makeAssets({ loadTexture }).assets, code);

    expect(loadTexture).toHaveBeenCalledTimes(2);
  });

  describe("with a cache folder", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), "banner-render-"));
      packagePath = path.join(dir, "core.tpac");
      await fs.writeFile(packagePath, "package");
    });

    afterEach(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    it("keeps the icons it decodes there for later", async () => {
      const cacheDir = path.join(dir, "cache");
      const loadTexture = vi.fn(() => Promise.resolve(GREEN_ATLAS));
      const code = `${BACKGROUND}.${layer(100, 2, 3)}`;
      const [first] = icons(
        await renderBannerAsync(makeAssets({ loadTexture }).assets, code, {
          cacheDir,
        }),
      );

      clearRecentIcons();
      const [cached] = icons(
        await renderBannerAsync(makeAssets({ loadTexture }).assets, code, {
          cacheDir,
        }),
      );

      expect(loadTexture).toHaveBeenCalledOnce();
      expect(cached!.href).toBe(first!.href);
      expect((await fs.readdir(cacheDir)).sort()).toEqual([
        "icons.bin",
        "icons.json",
      ]);
    });
  });
});

describe("getShapeTransform", () => {
  const LAYER: IBannerLayer = {
    meshId: 100,
    colorId: 0,
    colorId2: 0,
    sizeX: 493,
    sizeY: 400,
    positionX: 764,
    positionY: 700,
    drawStroke: false,
    mirror: false,
    rotation: 45,
  };

  it("translates, rotates counterclockwise and scales a unit icon", () => {
    expect(getShapeTransform({ kind: "icon", layer: LAYER, href: "" })).toBe(
      "translate(764 700) rotate(-45) scale(493 400)",
    );
  });

  it("mirrors horizontally", () => {
    expect(
      getShapeTransform({
        kind: "icon",
        layer: { ...LAYER, mirror: true },
        href: "",
      }),
    ).toBe("translate(764 700) rotate(-45) scale(-493 400)");
  });

  it("scales a background mesh by its size", () => {
    expect(
      getShapeTransform({
        kind: "background",
        layer: { ...LAYER, sizeX: 1528, sizeY: 1528, rotation: 0 },
        width: 2,
        height: 4,
        paths: [],
      }),
    ).toBe("translate(764 700) rotate(0) scale(764 382)");
  });
});

describe("getBannerPrimaryColor", () => {
  it("is the background layer's first color", () => {
    const { assets } = makeAssets();

    expect(
      getBannerPrimaryColor(
        assets,
        `11.2.1.1528.1528.764.764.0.0.0.${layer(100, 3, 0)}`,
      ),
    ).toBe("#b57a1e");
  });

  it("falls back to the game's color for an undefined one", () => {
    const { assets } = makeAssets();

    expect(
      getBannerPrimaryColor(assets, "11.77.1.1528.1528.764.764.0.0.0"),
    ).toBe("#adbeef");
  });

  it("is null for an invalid banner code", () => {
    const { assets } = makeAssets();

    expect(getBannerPrimaryColor(assets, "11.2.1")).toBeNull();
  });
});

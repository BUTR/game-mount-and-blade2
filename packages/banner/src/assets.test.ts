import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBannerAssets, getBannerAssetsAsync } from "./assets";
import {
  ITpacItem,
  ITpacMesh,
  readTpacItemsAsync,
  readTpacMaterialTextures,
  readTpacMetameshMeshes,
  readTpacTextureAsync,
  readTpacVertexStreamAsync,
  TPAC_MATERIAL,
  TPAC_METAMESH,
  TPAC_TEXTURE,
} from "@bannerlord/tpac";

vi.mock("@bannerlord/tpac", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bannerlord/tpac")>()),
  readTpacItemsAsync: vi.fn(),
  readTpacMaterialTextures: vi.fn(),
  readTpacMetameshMeshes: vi.fn(),
  readTpacTextureAsync: vi.fn(),
  readTpacVertexStreamAsync: vi.fn(),
}));

const MATERIAL = "custom_banner_icons_01";
const MESH_NAME = "banner_background_test_1";

const subModule = (id: string, name: string, xmlNodes: string): string => `
<Module>
  <Name value="${name}"/>
  <Id value="${id}"/>
  <Version value="v1.0.0"/>
  <Xmls>${xmlNodes}</Xmls>
</Module>`;

const bannerIconsNode = (xmlPath: string, gameTypes: string[] = []): string => `
    <XmlNode>
      <XmlName id="BannerIcons" path="${xmlPath}"/>
      ${
        gameTypes.length > 0
          ? `<IncludedGameTypes>${gameTypes
              .map((type) => `<GameType value="${type}"/>`)
              .join("")}</IncludedGameTypes>`
          : ""
      }
    </XmlNode>`;

const colors = (...entries: [number, string][]): string =>
  entries.map(([id, hex]) => `<Color id="${id}" hex="0xff${hex}" />`).join("");

let gamePath: string;

const writeAsync = async (
  relative: string,
  contents: string,
): Promise<void> => {
  const file = path.join(gamePath, "Modules", ...relative.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
};

const writeGameAsync = async (): Promise<void> => {
  await writeAsync(
    "Native/SubModule.xml",
    subModule(
      "Native",
      "Native",
      [
        bannerIconsNode("banner_icons", ["Campaign", "CampaignStoryMode"]),
        bannerIconsNode("mp_banner_icons", ["MultiplayerGame"]),
        `<!-- ${bannerIconsNode("commented")} -->`,
        `<XmlNode><XmlName id="Items" path="items"/></XmlNode>`,
      ].join(""),
    ),
  );
  await writeAsync(
    "Native/ModuleData/banner_icons.xml",
    `<base><BannerIconData>
      <BannerIconGroup id="1" is_pattern="true"><Background id="11" mesh_name="${MESH_NAME}" /></BannerIconGroup>
      <BannerIconGroup id="2" is_pattern="false"><Icon id="100" material_name="${MATERIAL}" texture_index="3" /></BannerIconGroup>
      <BannerColors>${colors([0, "111111"], [1, "222222"])}</BannerColors>
    </BannerIconData></base>`,
  );
  await writeAsync(
    "Native/ModuleData/mp_banner_icons.xml",
    colors([5, "555555"]),
  );
  await writeAsync("Native/ModuleData/commented.xml", colors([6, "666666"]));
  await writeAsync("Native/ModuleData/items.xml", colors([7, "777777"]));

  await writeAsync(
    "AMod/SubModule.xml",
    subModule("AMod", "A Mod", bannerIconsNode("icons")),
  );
  await writeAsync(
    "AMod/ModuleData/icons.xml",
    colors([0, "444444"], [1, "333333"]),
  );

  // Its icons are a folder of files, merged in name order
  await writeAsync(
    "ZMod/SubModule.xml",
    subModule("ZMod.Id", "Z Mod", bannerIconsNode("BannerIcons", ["Campaign"])),
  );
  await writeAsync("ZMod/ModuleData/BannerIcons/b.xml", colors([0, "bbbbbb"]));
  await writeAsync(
    "ZMod/ModuleData/BannerIcons/a.xml",
    `<BannerIconGroup id="3"><Icon id="200" material_name="mod_icons" texture_index="0" /></BannerIconGroup>${colors([0, "aaaaaa"], [8, "888888"])}`,
  );
  await writeAsync(
    "ZMod/ModuleData/BannerIcons/readme.txt",
    colors([9, "999999"]),
  );

  await writeAsync(
    "NoBanners/SubModule.xml",
    subModule("NoBanners", "No Banners", ""),
  );
  await writeAsync("Broken/ModuleData/icons.xml", colors([0, "000000"]));
};

const item = (
  filePath: string,
  type: string,
  guid: string,
  name: string,
): ITpacItem => ({
  filePath,
  type,
  guid,
  version: 0,
  name,
  metadata: Buffer.from(guid),
  segments: [],
});

const LOD0: ITpacMesh = {
  guid: "lod0",
  lod: 0,
  vertexCount: 4,
  boundingBox: { minX: -1, minY: -2, maxX: 1, maxY: 2 },
};

const corePath = (): string =>
  path.join(gamePath, "Modules", "Native", "AssetPackages", "core.tpac");

beforeEach(async () => {
  vi.clearAllMocks();
  clearBannerAssets();
  gamePath = await fs.mkdtemp(path.join(os.tmpdir(), "banner-assets-"));
  await writeGameAsync();

  vi.mocked(readTpacItemsAsync).mockImplementation((filePath, wanted) => {
    const items =
      path.basename(filePath) === "core.tpac"
        ? [
            item(filePath, TPAC_TEXTURE, "texture-1", "banner_icons_01"),
            item(filePath, TPAC_MATERIAL, "texture-1", MATERIAL),
            item(filePath, TPAC_METAMESH, "mesh-1", MESH_NAME),
          ]
        : [
            item(filePath, TPAC_MATERIAL, "texture-1", "unrelated_material"),
            item(filePath, TPAC_MATERIAL, "texture-missing", "mod_icons"),
          ];
    return Promise.resolve(items.filter((x) => wanted(x.type, x.name)));
  });
  // The material's metadata is the GUID of its diffuse texture
  vi.mocked(readTpacMaterialTextures).mockImplementation(
    (material) => new Map([[0, material.metadata.toString()]]),
  );
  vi.mocked(readTpacTextureAsync).mockImplementation((texture) =>
    Promise.resolve({
      width: 512,
      height: 512,
      format: "BC7",
      pixels: Buffer.from(texture.guid),
    }),
  );
  vi.mocked(readTpacMetameshMeshes).mockReturnValue([
    { ...LOD0, guid: "lod1", lod: 1 },
    LOD0,
  ]);
  vi.mocked(readTpacVertexStreamAsync).mockResolvedValue({
    indices: [0, 1, 2, 2, 1, 3, 0],
    colors: Uint8Array.from([
      255, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255, 51, 0, 0, 255,
    ]),
    positions: Float32Array.from([-1, -2, 0, 1, -2, 0, -1, 2, 0.5, 1, 2, 1]),
  });
});

afterEach(async () => {
  await fs.rm(gamePath, { recursive: true, force: true });
});

describe("getBannerAssetsAsync", () => {
  it("merges Native and then the other modules by folder name by default", async () => {
    const assets = await getBannerAssetsAsync(gamePath);

    expect(assets.colors).toEqual(
      new Map([
        [0, [0xbb, 0xbb, 0xbb]],
        [1, [0x33, 0x33, 0x33]],
        [8, [0x88, 0x88, 0x88]],
      ]),
    );
    expect(assets.icons).toEqual(
      new Map([
        [100, { materialName: MATERIAL, textureIndex: 3 }],
        [200, { materialName: "mod_icons", textureIndex: 0 }],
      ]),
    );
    expect(assets.backgrounds).toEqual(new Map([[11, MESH_NAME]]));
  });

  it("merges the modules in the given load order", async () => {
    const assets = await getBannerAssetsAsync(gamePath, ["ZMod.Id", "Native"]);

    expect(assets.colors.get(0)).toEqual([0x11, 0x11, 0x11]);
    expect(assets.colors.get(1)).toEqual([0x22, 0x22, 0x22]);
  });

  it("finds modules by their name, like older saves list them", async () => {
    const assets = await getBannerAssetsAsync(gamePath, ["Native", "A Mod"]);

    expect(assets.colors.get(0)).toEqual([0x44, 0x44, 0x44]);
    expect(assets.colors.get(1)).toEqual([0x33, 0x33, 0x33]);
  });

  it("ignores modules that aren't installed or have no banner icons", async () => {
    const assets = await getBannerAssetsAsync(gamePath, [
      "Native",
      "Missing",
      "NoBanners",
      "Broken",
    ]);

    expect(assets.colors).toEqual(
      new Map([
        [0, [0x11, 0x11, 0x11]],
        [1, [0x22, 0x22, 0x22]],
      ]),
    );
  });

  it("reads only the campaign's banner icons, ignoring commented out and other XMLs", async () => {
    const assets = await getBannerAssetsAsync(gamePath, ["Native"]);

    expect([...assets.colors.keys()]).toEqual([0, 1]);
  });

  it("reads Native's packages for textures and the referenced materials and meshes only", async () => {
    await getBannerAssetsAsync(gamePath);

    const calls = vi.mocked(readTpacItemsAsync).mock.calls;
    expect(calls.map(([filePath]) => filePath)).toEqual([
      corePath(),
      path.join(
        gamePath,
        "Modules",
        "Native",
        "AssetPackages",
        "core_game.tpac",
      ),
    ]);
    const wanted = calls[0]![1];
    expect(wanted(TPAC_TEXTURE, "anything")).toBe(true);
    expect(wanted(TPAC_MATERIAL, MATERIAL)).toBe(true);
    expect(wanted(TPAC_MATERIAL, "mod_icons")).toBe(true);
    expect(wanted(TPAC_MATERIAL, "unrelated_material")).toBe(false);
    expect(wanted(TPAC_METAMESH, MESH_NAME)).toBe(true);
    expect(wanted(TPAC_METAMESH, "other_mesh")).toBe(false);
  });

  it("returns the same assets for the same game and load order", async () => {
    const first = await getBannerAssetsAsync(gamePath, ["Native"]);
    const second = await getBannerAssetsAsync(gamePath, ["Native"]);
    const other = await getBannerAssetsAsync(gamePath, ["Native", "AMod"]);

    expect(second).toBe(first);
    expect(other).not.toBe(first);
    expect(readTpacItemsAsync).toHaveBeenCalledTimes(2);
  });

  it("reads the game again once cleared", async () => {
    await getBannerAssetsAsync(gamePath, ["Native"]);
    await writeAsync(
      "Native/ModuleData/banner_icons.xml",
      colors([0, "123456"]),
    );

    clearBannerAssets();
    const assets = await getBannerAssetsAsync(gamePath, ["Native"]);

    expect(assets.colors).toEqual(new Map([[0, [0x12, 0x34, 0x56]]]));
  });

  it("tries again after reading the game failed", async () => {
    vi.mocked(readTpacItemsAsync).mockRejectedValueOnce(new Error("locked"));

    await expect(getBannerAssetsAsync(gamePath)).rejects.toThrow("locked");
    await expect(getBannerAssetsAsync(gamePath)).resolves.toBeDefined();
  });
});

describe("the assets' textures and meshes", () => {
  it("find a material's diffuse texture without reading it", async () => {
    const assets = await getBannerAssetsAsync(gamePath);

    expect(assets.getMaterialTextureSource(MATERIAL)).toEqual({
      filePath: corePath(),
      guid: "texture-1",
    });
    expect(assets.getMaterialTextureSource("unknown")).toBeNull();
    // Its texture isn't in the packages
    expect(assets.getMaterialTextureSource("mod_icons")).toBeNull();
    expect(readTpacTextureAsync).not.toHaveBeenCalled();
  });

  it("read a material's texture once", async () => {
    const assets = await getBannerAssetsAsync(gamePath);

    const texture = await assets.getMaterialTextureAsync(MATERIAL);
    await assets.getMaterialTextureAsync(MATERIAL);

    expect(texture?.pixels).toEqual(Buffer.from("texture-1"));
    expect(readTpacTextureAsync).toHaveBeenCalledOnce();
    expect(await assets.getMaterialTextureAsync("unknown")).toBeNull();
  });

  it("build a background's triangles from its first LOD, once", async () => {
    const assets = await getBannerAssetsAsync(gamePath);

    const mesh = await assets.getBackgroundMeshAsync(MESH_NAME);
    await assets.getBackgroundMeshAsync(MESH_NAME);

    expect(readTpacVertexStreamAsync).toHaveBeenCalledOnce();
    expect(vi.mocked(readTpacVertexStreamAsync).mock.calls[0]![1]).toBe(LOD0);
    expect(mesh!.width).toBe(2);
    expect(mesh!.height).toBe(4);
    expect(mesh!.triangles).toHaveLength(2);
    expect(mesh!.triangles[0]!.points).toEqual([
      [-1, -2],
      [1, -2],
      [-1, 2],
    ]);
    expect(mesh!.triangles[0]!.shade).toBeCloseTo(2 / 3);
    expect(mesh!.triangles[0]!.z).toBeCloseTo(0.5 / 3);
    expect(mesh!.triangles[1]!.points).toEqual([
      [-1, 2],
      [1, -2],
      [1, 2],
    ]);
    expect(mesh!.triangles[1]!.shade).toBeCloseTo(0.4);
    expect(mesh!.triangles[1]!.z).toBeCloseTo(0.5);
  });

  it("have no background for an unknown mesh", async () => {
    const assets = await getBannerAssetsAsync(gamePath);

    expect(await assets.getBackgroundMeshAsync("unknown")).toBeNull();
  });
});

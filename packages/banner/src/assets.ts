import { promises as fs } from "fs";
import path from "path";
import { mapInOrderAsync } from "@bannerlord/read-ahead";
import {
  buildBannerTables,
  IBannerIconsDocument,
  IBannerTables,
  mergeBannerIcons,
  parseBannerIconsXml,
} from "./bannerIcons";
import {
  ITpacItem,
  ITpacTexture,
  readTpacItemsAsync,
  readTpacMaterialTextures,
  readTpacMetameshMeshes,
  readTpacTextureAsync,
  readTpacVertexStreamAsync,
  TPAC_MATERIAL,
  TPAC_METAMESH,
  TPAC_TEXTURE,
} from "@bannerlord/tpac";
import {
  MODULES,
  readModuleFoldersAsync,
  SUBMODULE_FILE,
} from "@bannerlord/game-layout";

const NATIVE = "Native";
const MODULE_DATA = "ModuleData";
const BANNER_ICONS_XML_ID = "BannerIcons";
// Save games correspond to campaigns; filter out module XML entries intended strictly for other game modes
const CAMPAIGN_GAME_TYPES = ["Campaign", "CampaignStoryMode"];
/**
 * Native asset packages containing banner materials (custom_banner_icons_NN, etc.),
 * diffuse textures, and background metameshes (banner_background_test_N).
 */
const PACKAGES = ["core.tpac", "core_game.tpac"].map((file) =>
  path.join(NATIVE, "AssetPackages", file),
);
// The icon material shader (gui_color_and_stroke) samples diffuse texture from slot 0
const DIFFUSE_SLOT = 0;

/**
 * Background mesh geometry represented as triangles in mesh units (Y-up),
 * including per-triangle shade factor derived from vertex color red channel
 * (0.0 = secondary color, 1.0 = primary color).
 */
export interface IBannerBackgroundMesh {
  triangles: { points: [number, number][]; shade: number; z: number }[];
  width: number;
  height: number;
}

/**
 * Where a texture is stored: the texture package and the texture's id in it
 */
export interface IBannerTextureSource {
  filePath: string;
  guid: string;
}

export interface IBannerAssets extends IBannerTables {
  /**
   * Resolves the texture used by a given material, or null if the material does not exist.
   */
  getMaterialTextureAsync: (
    materialName: string,
  ) => Promise<ITpacTexture | null>;
  /**
   * Where the texture of a material is stored, without reading it. Null if the material does not exist.
   */
  getMaterialTextureSource: (
    materialName: string,
  ) => IBannerTextureSource | null;
  /**
   * Resolves the background mesh by name, or null if not found.
   */
  getBackgroundMeshAsync: (
    meshName: string,
  ) => Promise<IBannerBackgroundMesh | null>;
}

/**
 * Cached game banner assets independent of load order.
 */
interface IGameBannerData {
  /**
   * Banner icon documents for each module keyed by module ID (ordered as listed in SubModule.xml).
   */
  documentsByModule: Map<string, IBannerIconsDocument[]>;
  /**
   * Map of module names to module IDs (legacy save games identify modules by display name).
   */
  idsByName: Map<string, string>;
  /**
   * Module IDs containing banner icon definitions (Native first, followed alphabetically by folder name).
   */
  defaultOrder: string[];
  getMaterialTextureAsync: IBannerAssets["getMaterialTextureAsync"];
  getMaterialTextureSource: IBannerAssets["getMaterialTextureSource"];
  getBackgroundMeshAsync: IBannerAssets["getBackgroundMeshAsync"];
}

const readAttribute = (attributes: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attributes)?.[1];

/**
 * Resolves a module's ID and all BannerIcons XML files declared in its SubModule.xml.
 * Matches `MBObjectManager.GetMergedXmlForManaged` resolution: checks `ModuleData/{path}.xml`,
 * or falls back to all XML files inside `ModuleData/{path}/` if no file matches directly.
 */
const readModuleAsync = async (
  modulePath: string,
): Promise<{
  id: string;
  name: string | undefined;
  files: string[];
} | null> => {
  const subModule = await fs
    .readFile(path.join(modulePath, SUBMODULE_FILE), "utf8")
    .catch(() => null);
  const readValue = (tag: string): string | undefined =>
    readAttribute(
      new RegExp(`<${tag}\\b([^>]*)>`).exec(subModule ?? "")?.[1] ?? "",
      "value",
    );
  const id = readValue("Id");
  const name = readValue("Name");
  if (subModule === null || id === undefined) {
    return null;
  }

  const files: string[] = [];
  const withoutComments = subModule.replace(/<!--[\s\S]*?-->/g, "");
  for (const [, node = ""] of withoutComments.matchAll(
    /<XmlNode>([\s\S]*?)<\/XmlNode>/g,
  )) {
    const name = /<XmlName\b([^>]*)>/.exec(node)?.[1] ?? "";
    const xmlPath = readAttribute(name, "path");
    if (readAttribute(name, "id") !== BANNER_ICONS_XML_ID || !xmlPath) {
      continue;
    }
    const gameTypes = [...node.matchAll(/<GameType\b([^>]*)>/g)].map(
      ([, attributes]) => readAttribute(attributes ?? "", "value"),
    );
    if (
      gameTypes.length > 0 &&
      !gameTypes.some((type) => CAMPAIGN_GAME_TYPES.includes(type ?? ""))
    ) {
      continue;
    }
    const file = path.join(modulePath, MODULE_DATA, `${xmlPath}.xml`);
    const isFile = await fs
      .stat(file)
      .then((stats) => stats.isFile())
      .catch(() => false);
    if (isFile) {
      files.push(file);
      continue;
    }
    const folder = path.join(modulePath, MODULE_DATA, xmlPath);
    const entries = await fs.readdir(folder).catch(() => []);
    files.push(
      ...entries
        .filter((entry) => entry.toLowerCase().endsWith(".xml"))
        .sort()
        .map((entry) => path.join(folder, entry)),
    );
  }
  return { id, name, files };
};

/**
 * Extracts triangle geometry from the highest detail level (LOD 0) of a background metamesh.
 */
const readBackgroundMeshAsync = async (
  item: ITpacItem,
): Promise<IBannerBackgroundMesh | null> => {
  const meshes = readTpacMetameshMeshes(item);
  const mesh = meshes.find((candidate) => candidate.lod === 0) ?? meshes[0];
  if (mesh === undefined) {
    return null;
  }
  const stream = await readTpacVertexStreamAsync(item, mesh);
  const triangles: IBannerBackgroundMesh["triangles"] = [];
  for (let index = 0; index + 2 < stream.indices.length; index += 3) {
    const corners = stream.indices.slice(index, index + 3);
    triangles.push({
      points: corners.map((corner) => [
        stream.positions[corner * 3]!,
        stream.positions[corner * 3 + 1]!,
      ]),
      // The shader interpolates colors using the vertex color's red channel
      shade:
        corners.reduce(
          (sum, corner) => sum + stream.colors[corner * 4]! / 255,
          0,
        ) / 3,
      z:
        corners.reduce(
          (sum, corner) => sum + stream.positions[corner * 3 + 2]!,
          0,
        ) / 3,
    });
  }
  const { minX, minY, maxX, maxY } = mesh.boundingBox;
  return { triangles, width: maxX - minX, height: maxY - minY };
};

const memoize = <T>(
  load: (key: string) => Promise<T>,
): ((key: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return (key) => {
    let value = cache.get(key);
    if (value === undefined) {
      value = load(key);
      cache.set(key, value);
    }
    return value;
  };
};

const readGameBannerDataAsync = async (
  gamePath: string,
): Promise<IGameBannerData> => {
  const modulesPath = path.join(gamePath, MODULES);
  const folders = (await readModuleFoldersAsync(gamePath)).sort((a, b) =>
    a === NATIVE ? -1 : b === NATIVE ? 1 : a.localeCompare(b),
  );

  // The modules and their banner files are read together, then kept in the folders' order: a later module of an id
  // or a name replaces an earlier one
  const modules = await mapInOrderAsync(folders, async (folder) => {
    const module = await readModuleAsync(path.join(modulesPath, folder));
    if (module === null || module.files.length === 0) {
      return null;
    }
    const xmls = await mapInOrderAsync(module.files, (file) =>
      fs.readFile(file, "utf8").catch(() => null),
    );
    return { module, xmls };
  });

  const documentsByModule = new Map<string, IBannerIconsDocument[]>();
  const idsByName = new Map<string, string>();
  for (const read of modules) {
    if (read === null) {
      continue;
    }
    const { module, xmls } = read;
    if (module.name !== undefined) {
      idsByName.set(module.name, module.id);
    }
    const documents: IBannerIconsDocument[] = [];
    for (const xml of xmls) {
      if (xml !== null) {
        documents.push(parseBannerIconsXml(xml));
      }
    }
    documentsByModule.set(module.id, documents);
  }

  // Collect all unique material and mesh references required across all module documents
  const materialNames = new Set<string>();
  const meshNames = new Set<string>();
  for (const document of [...documentsByModule.values()].flat()) {
    for (const group of document.groups) {
      group.icons.forEach((icon) => {
        const name = icon.attributes.get("material_name");
        if (name !== undefined) materialNames.add(name);
      });
      group.backgrounds.forEach((background) => {
        const name = background.attributes.get("mesh_name");
        if (name !== undefined) meshNames.add(name);
      });
    }
  }
  const items = (
    await Promise.all(
      PACKAGES.map((file) =>
        readTpacItemsAsync(
          path.join(modulesPath, file),
          (type, name) =>
            type === TPAC_TEXTURE ||
            (type === TPAC_MATERIAL && materialNames.has(name)) ||
            (type === TPAC_METAMESH && meshNames.has(name)),
        ),
      ),
    )
  ).flat();
  const texturesByGuid = new Map(
    items
      .filter((item) => item.type === TPAC_TEXTURE)
      .map((item) => [item.guid, item]),
  );
  const materials = new Map(
    items
      .filter((item) => item.type === TPAC_MATERIAL)
      .map((item) => [item.name, item]),
  );
  const metameshes = new Map(
    items
      .filter((item) => item.type === TPAC_METAMESH)
      .map((item) => [item.name, item]),
  );

  const getMaterialTexture = (materialName: string): ITpacItem | undefined => {
    const material = materials.get(materialName);
    const textureGuid =
      material !== undefined
        ? readTpacMaterialTextures(material).get(DIFFUSE_SLOT)
        : undefined;
    return textureGuid !== undefined
      ? texturesByGuid.get(textureGuid)
      : undefined;
  };

  return {
    documentsByModule,
    idsByName,
    defaultOrder: [...documentsByModule.keys()],
    getMaterialTextureAsync: memoize(async (materialName) => {
      const texture = getMaterialTexture(materialName);
      return texture !== undefined ? readTpacTextureAsync(texture) : null;
    }),
    getMaterialTextureSource: (materialName) => {
      const texture = getMaterialTexture(materialName);
      return texture !== undefined
        ? { filePath: texture.filePath, guid: texture.guid }
        : null;
    },
    getBackgroundMeshAsync: memoize(async (meshName) => {
      const metamesh = metameshes.get(meshName);
      return metamesh !== undefined ? readBackgroundMeshAsync(metamesh) : null;
    }),
  };
};

const gameDataByPath = new Map<string, Promise<IGameBannerData>>();

/**
 * Forgets the game banner data read so far, the game's files may have changed
 */
export const clearBannerAssets = (): void => {
  gameDataByPath.clear();
};
const assetsByOrder = new WeakMap<
  IGameBannerData,
  Map<string, IBannerAssets>
>();

const getGameBannerDataAsync = (gamePath: string): Promise<IGameBannerData> => {
  let data = gameDataByPath.get(gamePath);
  if (data === undefined) {
    data = readGameBannerDataAsync(gamePath);
    // Clear cache on failure so subsequent attempts can retry (e.g. if files were locked during a game update)
    data.catch(() => gameDataByPath.delete(gamePath));
    gameDataByPath.set(gamePath, data);
  }
  return data;
};

/**
 * Loads banner colors, icons, and backgrounds with modules merged according to the provided load order.
 * Modules missing from the game installation are safely ignored.
 * Module XML definitions are cached on first load, while textures and meshes are lazily loaded on demand.
 *
 * @param moduleIds Module IDs or names in load order (matching save game data). If omitted, defaults to Native followed by discovered modules.
 */
export const getBannerAssetsAsync = async (
  gamePath: string,
  moduleIds?: readonly string[],
): Promise<IBannerAssets> => {
  const data = await getGameBannerDataAsync(gamePath);
  const order = moduleIds ?? data.defaultOrder;
  const key = order.join(";");

  let byOrder = assetsByOrder.get(data);
  if (byOrder === undefined) {
    byOrder = new Map();
    assetsByOrder.set(data, byOrder);
  }
  let assets = byOrder.get(key);
  if (assets === undefined) {
    const documents = order.flatMap(
      (module) =>
        data.documentsByModule.get(module) ??
        data.documentsByModule.get(data.idsByName.get(module) ?? "") ??
        [],
    );
    assets = {
      ...buildBannerTables(mergeBannerIcons(documents)),
      getMaterialTextureAsync: data.getMaterialTextureAsync,
      getMaterialTextureSource: data.getMaterialTextureSource,
      getBackgroundMeshAsync: data.getBackgroundMeshAsync,
    };
    byOrder.set(key, assets);
  }
  return assets;
};

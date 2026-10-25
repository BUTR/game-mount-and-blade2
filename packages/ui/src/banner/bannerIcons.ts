/**
 * Parses and merges `banner_icons.xml` files matching the game's XML pipeline:
 * merges module XML files in load order via `MBObjectManager.MergeElements` (under `XmlSchemas/BannerIcons.xsd`),
 * then converts them into lookup tables matching `BannerManager.LoadBannerIconsFromXml` and `BannerIconGroup.Deserialize`.
 */

export type RGB = [number, number, number];

/**
 * A sub-texture cell in a 4x4 texture atlas, corresponding to `TaleWorlds.Core.BannerIconData`.
 */
export interface IBannerIcon {
  materialName: string;
  textureIndex: number;
}

export interface IBannerTables {
  colors: Map<number, RGB>;
  /**
   * Banner icon data keyed by icon ID.
   */
  icons: Map<number, IBannerIcon>;
  /**
   * Mesh names keyed by background ID (pattern groups only, matching `BannerManager.GetBackgroundMeshName`).
   */
  backgrounds: Map<number, string>;
}

interface IElement {
  attributes: Map<string, string>;
}

interface IGroup extends IElement {
  backgrounds: IElement[];
  icons: IElement[];
}

export interface IBannerIconsDocument {
  groups: IGroup[];
  colors: IElement[];
}

// Attribute indicating that the target element's contents should be replaced rather than merged
const REPLACE_WHILE_MERGING = "_replaceWhileMerging";

const parseAttributes = (text: string): Map<string, string> =>
  new Map(
    [...text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map(
      ([, name, value]) => [name!, value!] as [string, string],
    ),
  );

const elements = (xml: string, tag: string): IElement[] =>
  [...xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map(
    ([, attributes]) => ({ attributes: parseAttributes(attributes ?? "") }),
  );

export const parseBannerIconsXml = (xml: string): IBannerIconsDocument => {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, "");
  const groups = [
    ...withoutComments.matchAll(
      /<BannerIconGroup\b([^>]*?)(?:\/>|>([\s\S]*?)<\/BannerIconGroup>)/g,
    ),
  ].map(([, attributes, body = ""]) => ({
    attributes: parseAttributes(attributes ?? ""),
    backgrounds: elements(body, "Background"),
    icons: elements(body, "Icon"),
  }));
  return { groups, colors: elements(withoutComments, "Color") };
};

const isReplacing = (element: IElement): boolean =>
  element.attributes.get(REPLACE_WHILE_MERGING) === "true";

/**
 * Merges element attributes matching `MBObjectManager.MergeElementAttributes` (attributes in later files overwrite earlier ones).
 */
const mergeAttributes = (target: IElement, source: IElement): void => {
  if (isReplacing(source)) {
    target.attributes.clear();
  }
  for (const [name, value] of source.attributes) {
    target.attributes.set(name, value);
  }
};

/**
 * Implements `MBObjectManager.MergeElements` for unique-ID elements:
 * merges into any earlier element with a matching ID, or appends if no match exists.
 */
const mergeById = <T extends IElement>(
  targets: T[],
  sources: T[],
  merge: (target: T, source: T) => void,
): void => {
  // Index earlier elements by ID to replicate the game's dictionary lookup behavior
  const byId = new Map<string, T>();
  for (const target of targets) {
    byId.set(target.attributes.get("id") ?? "", target);
  }
  for (const source of sources) {
    const id = source.attributes.get("id") ?? "";
    const target = id !== "" ? byId.get(id) : undefined;
    if (target !== undefined) {
      merge(target, source);
    } else {
      targets.push(source);
    }
  }
};

const mergeGroup = (target: IGroup, source: IGroup): void => {
  mergeAttributes(target, source);
  if (isReplacing(source)) {
    target.backgrounds = [];
    target.icons = [];
  }
  mergeById(target.backgrounds, source.backgrounds, mergeAttributes);
  mergeById(target.icons, source.icons, mergeAttributes);
};

/**
 * Merges banner icon documents in load order, using the first document as the base.
 */
export const mergeBannerIcons = (
  documents: IBannerIconsDocument[],
): IBannerIconsDocument => {
  // Clone elements so mutations during merging do not affect parsed documents shared across load orders
  const copy = (element: IElement): IElement => ({
    attributes: new Map(element.attributes),
  });
  const merged: IBannerIconsDocument = { groups: [], colors: [] };
  for (const document of documents) {
    mergeById(
      merged.groups,
      document.groups.map((group) => ({
        ...copy(group),
        backgrounds: group.backgrounds.map(copy),
        icons: group.icons.map(copy),
      })),
      mergeGroup,
    );
    mergeById(merged.colors, document.colors.map(copy), mergeAttributes);
  }
  return merged;
};

const toInt = (value: string | undefined): number | null => {
  const number = Number(value);
  return value !== undefined && Number.isInteger(number) ? number : null;
};

/**
 * Builds `BannerManager` lookup tables from a merged document (the first definition of an ID takes precedence).
 */
export const buildBannerTables = (
  document: IBannerIconsDocument,
): IBannerTables => {
  const tables: IBannerTables = {
    colors: new Map(),
    icons: new Map(),
    backgrounds: new Map(),
  };
  // If an earlier non-pattern group claimed a background ID, ignore subsequent pattern group definitions
  const takenBackgrounds = new Set<number>();
  for (const group of document.groups) {
    const isPattern =
      group.attributes.get("is_pattern")?.toLowerCase() === "true";
    for (const icon of group.icons) {
      const id = toInt(icon.attributes.get("id"));
      const materialName = icon.attributes.get("material_name");
      const textureIndex = toInt(icon.attributes.get("texture_index"));
      if (
        id !== null &&
        materialName !== undefined &&
        textureIndex !== null &&
        !tables.icons.has(id)
      ) {
        tables.icons.set(id, { materialName, textureIndex });
      }
    }
    for (const background of group.backgrounds) {
      const id = toInt(background.attributes.get("id"));
      const meshName = background.attributes.get("mesh_name");
      if (id === null || meshName === undefined || takenBackgrounds.has(id)) {
        continue;
      }
      takenBackgrounds.add(id);
      if (isPattern) {
        tables.backgrounds.set(id, meshName);
      }
    }
  }
  for (const color of document.colors) {
    const id = toInt(color.attributes.get("id"));
    const hex = /^(?:0x)?[0-9a-f]{0,2}([0-9a-f]{6})$/i.exec(
      color.attributes.get("hex") ?? "",
    )?.[1];
    if (id === null || hex === undefined || tables.colors.has(id)) {
      continue;
    }
    const value = parseInt(hex, 16);
    tables.colors.set(id, [
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }
  return tables;
};

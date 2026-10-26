import { describe, expect, it } from "vitest";
import {
  buildBannerTables,
  mergeBannerIcons,
  parseBannerIconsXml,
} from "./bannerIcons";

const NATIVE = `<?xml version="1.0" encoding="utf-8"?>
<base xsi:noNamespaceSchemaLocation="../XmlSchemas/BannerIcons.xsd" type="string">
  <BannerIconData>
    <BannerIconGroup id="1" name="{=str_banner_icon_backgrounds}Backgrounds" is_pattern="true">
      <Background id="11" mesh_name="banner_background_test_1" />
      <Background id="12" mesh_name="banner_background_test_2" is_base_background="true" />
    </BannerIconGroup>
    <!-- <BannerIconGroup id="9" name="Commented out"><Icon id="900" material_name="nope" texture_index="0" /></BannerIconGroup> -->
    <BannerIconGroup id="2" name="{=str_banner_icon_animal}Animal" is_pattern="false">
      <Icon id="100" material_name="custom_banner_icons_01" texture_index="0" />
      <Icon id="101" material_name="custom_banner_icons_01" texture_index="1" is_reserved="true" />
    </BannerIconGroup>
    <BannerColors>
      <Color id="0" hex="0xffB57A1E" player_can_choose_for_background="true" />
      <Color id="1" hex="0xff4E1A13" />
    </BannerColors>
  </BannerIconData>
</base>`;

const attributes = (map: Map<string, string>): Record<string, string> =>
  Object.fromEntries(map);

describe("parseBannerIconsXml", () => {
  it("reads groups with their backgrounds and icons, and the colors", () => {
    const document = parseBannerIconsXml(NATIVE);

    expect(
      document.groups.map((group) => attributes(group.attributes)),
    ).toEqual([
      {
        id: "1",
        name: "{=str_banner_icon_backgrounds}Backgrounds",
        is_pattern: "true",
      },
      { id: "2", name: "{=str_banner_icon_animal}Animal", is_pattern: "false" },
    ]);
    expect(
      document.groups[0]!.backgrounds.map((x) => attributes(x.attributes)),
    ).toEqual([
      { id: "11", mesh_name: "banner_background_test_1" },
      {
        id: "12",
        mesh_name: "banner_background_test_2",
        is_base_background: "true",
      },
    ]);
    expect(
      document.groups[1]!.icons.map((x) => x.attributes.get("texture_index")),
    ).toEqual(["0", "1"]);
    expect(document.colors.map((x) => attributes(x.attributes))).toEqual([
      { id: "0", hex: "0xffB57A1E", player_can_choose_for_background: "true" },
      { id: "1", hex: "0xff4E1A13" },
    ]);
  });

  it("ignores commented out elements", () => {
    const document = parseBannerIconsXml(NATIVE);

    expect(document.groups.map((group) => group.attributes.get("id"))).toEqual([
      "1",
      "2",
    ]);
  });

  it("reads a self-closing group as one without children", () => {
    const document = parseBannerIconsXml(
      `<BannerIconGroup id="5" is_pattern="true" /><Color id="3" hex="0xff000000"/>`,
    );

    expect(document.groups).toEqual([
      {
        attributes: new Map([
          ["id", "5"],
          ["is_pattern", "true"],
        ]),
        backgrounds: [],
        icons: [],
      },
    ]);
    expect(document.colors).toHaveLength(1);
  });
});

describe("mergeBannerIcons", () => {
  it("merges the attributes of elements with the same ID, later documents winning", () => {
    const merged = mergeBannerIcons([
      parseBannerIconsXml(NATIVE),
      parseBannerIconsXml(`
        <BannerIconGroup id="2">
          <Icon id="100" texture_index="5" />
          <Icon id="200" material_name="mod_icons" texture_index="0" />
        </BannerIconGroup>
        <Color id="1" hex="0xff112233" />`),
    ]);

    const animals = merged.groups[1]!;
    expect(attributes(animals.attributes)).toEqual({
      id: "2",
      name: "{=str_banner_icon_animal}Animal",
      is_pattern: "false",
    });
    expect(animals.icons.map((icon) => attributes(icon.attributes))).toEqual([
      {
        id: "100",
        material_name: "custom_banner_icons_01",
        texture_index: "5",
      },
      {
        id: "101",
        material_name: "custom_banner_icons_01",
        texture_index: "1",
        is_reserved: "true",
      },
      { id: "200", material_name: "mod_icons", texture_index: "0" },
    ]);
    expect(merged.colors.map((color) => color.attributes.get("hex"))).toEqual([
      "0xffB57A1E",
      "0xff112233",
    ]);
  });

  it("appends groups with new IDs", () => {
    const merged = mergeBannerIcons([
      parseBannerIconsXml(NATIVE),
      parseBannerIconsXml(
        `<BannerIconGroup id="3" is_pattern="false"></BannerIconGroup>`,
      ),
    ]);

    expect(merged.groups.map((group) => group.attributes.get("id"))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("replaces a group's attributes and children when the later one says so", () => {
    const merged = mergeBannerIcons([
      parseBannerIconsXml(NATIVE),
      parseBannerIconsXml(`
        <BannerIconGroup id="2" _replaceWhileMerging="true">
          <Icon id="300" material_name="mod_icons" texture_index="2" />
        </BannerIconGroup>`),
    ]);

    const animals = merged.groups[1]!;
    expect(attributes(animals.attributes)).toEqual({
      id: "2",
      _replaceWhileMerging: "true",
    });
    expect(animals.icons.map((icon) => icon.attributes.get("id"))).toEqual([
      "300",
    ]);
  });

  it("replaces only the attributes of an element that says so", () => {
    const merged = mergeBannerIcons([
      parseBannerIconsXml(NATIVE),
      parseBannerIconsXml(
        `<Color id="0" hex="0xff000000" _replaceWhileMerging="true" />`,
      ),
    ]);

    expect(attributes(merged.colors[0]!.attributes)).toEqual({
      id: "0",
      hex: "0xff000000",
      _replaceWhileMerging: "true",
    });
  });

  it("leaves the parsed documents as they were", () => {
    const native = parseBannerIconsXml(NATIVE);
    const mod = parseBannerIconsXml(
      `<BannerIconGroup id="2" _replaceWhileMerging="true"></BannerIconGroup><Color id="0" hex="0xff000000" />`,
    );

    mergeBannerIcons([native, mod]);

    expect(native).toEqual(parseBannerIconsXml(NATIVE));
  });
});

describe("buildBannerTables", () => {
  it("builds the colors, icons and pattern backgrounds by ID", () => {
    const tables = buildBannerTables(parseBannerIconsXml(NATIVE));

    expect(tables.colors).toEqual(
      new Map([
        [0, [0xb5, 0x7a, 0x1e]],
        [1, [0x4e, 0x1a, 0x13]],
      ]),
    );
    expect(tables.icons).toEqual(
      new Map([
        [100, { materialName: "custom_banner_icons_01", textureIndex: 0 }],
        [101, { materialName: "custom_banner_icons_01", textureIndex: 1 }],
      ]),
    );
    expect(tables.backgrounds).toEqual(
      new Map([
        [11, "banner_background_test_1"],
        [12, "banner_background_test_2"],
      ]),
    );
  });

  it("keeps the first definition of an ID", () => {
    const tables = buildBannerTables(
      parseBannerIconsXml(`
        <BannerIconGroup id="1" is_pattern="TRUE">
          <Background id="1" mesh_name="first" />
          <Background id="1" mesh_name="second" />
          <Icon id="5" material_name="first" texture_index="0" />
          <Icon id="5" material_name="second" texture_index="1" />
        </BannerIconGroup>
        <Color id="7" hex="0xff010203" />
        <Color id="7" hex="0xff040506" />`),
    );

    expect(tables.backgrounds.get(1)).toBe("first");
    expect(tables.icons.get(5)?.materialName).toBe("first");
    expect(tables.colors.get(7)).toEqual([1, 2, 3]);
  });

  it("lets a background ID claimed by a non-pattern group hide later pattern ones", () => {
    const tables = buildBannerTables(
      parseBannerIconsXml(`
        <BannerIconGroup id="1" is_pattern="false"><Background id="1" mesh_name="plain" /></BannerIconGroup>
        <BannerIconGroup id="2" is_pattern="true">
          <Background id="1" mesh_name="pattern" />
          <Background id="2" mesh_name="other" />
        </BannerIconGroup>`),
    );

    expect(tables.backgrounds).toEqual(new Map([[2, "other"]]));
  });

  it("reads colors with or without the 0x prefix and the alpha byte", () => {
    const tables = buildBannerTables(
      parseBannerIconsXml(`
        <Color id="1" hex="ABCDEF" />
        <Color id="2" hex="0x123456" />
        <Color id="3" hex="ff654321" />`),
    );

    expect(tables.colors).toEqual(
      new Map([
        [1, [0xab, 0xcd, 0xef]],
        [2, [0x12, 0x34, 0x56]],
        [3, [0x65, 0x43, 0x21]],
      ]),
    );
  });

  it("skips elements with missing or malformed values", () => {
    const tables = buildBannerTables(
      parseBannerIconsXml(`
        <BannerIconGroup id="1" is_pattern="true">
          <Background mesh_name="no id" />
          <Background id="2" />
          <Background id="3.5" mesh_name="fractional id" />
          <Icon id="10" texture_index="0" />
          <Icon id="11" material_name="m" />
          <Icon id="12" material_name="m" texture_index="x" />
          <Icon id="abc" material_name="m" texture_index="0" />
        </BannerIconGroup>
        <Color id="1" hex="0xGG0000" />
        <Color id="2" hex="0x1234" />
        <Color hex="0xff000000" />`),
    );

    expect(tables.backgrounds.size).toBe(0);
    expect(tables.icons.size).toBe(0);
    expect(tables.colors.size).toBe(0);
  });
});

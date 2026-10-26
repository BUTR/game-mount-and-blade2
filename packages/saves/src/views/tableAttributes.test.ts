import { describe, expect, it, vi } from "vitest";
import { types as vetypes } from "@butr/vortexextensionnative";
import { Localize } from "@bannerlord/core/localization/types";
import { ISaveGame } from "./types";
import { getSaveColumns } from "./tableAttributes";

// The cells are React components, the columns' sorting and grouping is what the list's order depends on
vi.mock("./components/RadioView", () => ({ RadioView: () => null }));
vi.mock("./components/StatusView", () => ({ StatusView: () => null }));
vi.mock("@bannerlord/ui/components/BannerImage", () => ({
  BannerImage: () => null,
}));

const t: Localize = (template, values = {}) =>
  template
    .replace(/^\{=[^}]*\}/, "")
    .replace(/\{\{(\w+)\}\}/g, (all, key: string) =>
      String(values[key] ?? all),
    );

const save = (name: string, options: Partial<ISaveGame> = {}): ISaveGame => ({
  index: 1,
  modules: {},
  ...options,
  name,
});

const version = (
  major: number,
  minor: number,
  revision: number,
): vetypes.ApplicationVersion => ({
  applicationVersionType: vetypes.ApplicationVersionType.Release,
  major,
  minor,
  revision,
  changeSet: 0,
});

const columns = (hasBLSE: boolean, launchSave: ISaveGame | null = null) => {
  const list = getSaveColumns(t, hasBLSE, launchSave, () => Promise.resolve());
  const column = (id: string) => {
    const found = list.find((c) => c.id === id);
    if (found === undefined) {
      throw new Error(`No ${id} column`);
    }
    return found;
  };
  return { list, column };
};

// 2024-01-02T03:04:05Z in .NET ticks
const TICKS = 638397614450000000;

describe("getSaveColumns", () => {
  it("has the Launch column first only with BLSE, the game can't start into a save without it", () => {
    const ids = (hasBLSE: boolean): string[] =>
      columns(hasBLSE).list.map((column) => column.id);

    expect(ids(true)[0]).toBe("launch");
    expect(ids(false)).not.toContain("launch");
    expect(ids(true).slice(1)).toEqual(ids(false));
  });

  it("sorts the launch column with the launch save first", () => {
    const campaign = save("Campaign");
    const { column } = columns(true, campaign);

    expect(column("launch").sortValue?.(campaign)).toBe(1);
    expect(column("launch").sortValue?.(save("Other"))).toBe(0);
    expect(column("launch").firstDirection).toBe("desc");
  });

  it("sorts and groups by what the cells show", () => {
    const { column } = columns(false);
    const full = save("Campaign", {
      characterName: "Arwa",
      mainHeroLevel: 17,
      dayLong: 102.9,
      applicationVersion: version(1, 2, 9),
      creationTime: TICKS,
      missingModules: ["A", "B"],
    });

    expect(column("name").sortValue?.(full)).toBe("Campaign");
    expect(column("characterName").sortValue?.(full)).toBe("Arwa");
    expect(column("characterName").groupValue?.(full)).toBe("Arwa");
    expect(column("mainHeroLevel").sortValue?.(full)).toBe(17);
    expect(column("dayLong").sortValue?.(full)).toBe(102);
    expect(column("dayLong").render(full)).toBe(102);
    expect(column("applicationVersion").sortValue?.(full)).toBe("v1.2.9.0");
    expect(column("applicationVersion").groupValue?.(full)).toBe("v1.2.9.0");
    expect(column("creationTime").sortValue?.(full)).toBe(
      Date.UTC(2024, 0, 2, 3, 4, 5),
    );
    expect(column("status").sortValue?.(full)).toBe(2);
  });

  it("sorts the saves without a value as null, so they go last", () => {
    const { column } = columns(false);
    const bare = save("Bare");

    for (const id of [
      "characterName",
      "mainHeroLevel",
      "dayLong",
      "applicationVersion",
      "creationTime",
    ]) {
      expect(column(id).sortValue?.(bare), id).toBeNull();
    }
    expect(column("characterName").groupValue?.(bare)).toBeNull();
    expect(column("applicationVersion").groupValue?.(bare)).toBeNull();
    expect(column("mainHeroLevel").render(bare)).toBe("");
    expect(column("dayLong").render(bare)).toBe("");
    expect(column("status").sortValue?.(bare)).toBe(0);
  });
});

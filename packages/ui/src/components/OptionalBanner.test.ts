import { describe, expect, it } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { isOptional } from "./OptionalBanner";
import { IVortexViewModelData } from "@bannerlord/core/types";

type Entry = types.IFBLOLoadOrderEntry<IVortexViewModelData>;

const entry = (
  modId: string | undefined,
  isOfficial: boolean | undefined,
): Entry =>
  ({
    id: "Module",
    name: "Module",
    enabled: true,
    modId,
    data:
      isOfficial !== undefined
        ? { moduleInfoExtended: { isOfficial } }
        : undefined,
  }) as unknown as Entry;

describe("isOptional", () => {
  it("is a module that isn't managed by Vortex and isn't the game's own", () => {
    expect(isOptional(entry(undefined, false))).toBe(true);
  });

  it("isn't a module of a mod Vortex manages", () => {
    expect(isOptional(entry("mod-1", false))).toBe(false);
  });

  it("isn't one of the game's own modules", () => {
    expect(isOptional(entry(undefined, true))).toBe(false);
  });

  it("isn't an entry whose module wasn't found", () => {
    expect(isOptional(entry(undefined, undefined))).toBe(false);
  });
});

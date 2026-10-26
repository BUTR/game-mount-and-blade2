import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { findMod, findModByPredicate, isModActive } from "./modStorage";
import { IBannerlordMod } from "../types";

vi.mock("@butr/vortexextensionnative", () => {
  type Version = number[];
  return {
    BannerlordModuleManager: {
      parseApplicationVersion: (value: string): Version =>
        (/(\d+)\.(\d+)\.(\d+)/.exec(value)?.slice(1) ?? ["0", "0", "0"]).map(
          Number,
        ),
      compareVersions: (x: Version, y: Version): number => {
        const i = x.findIndex((part, index) => part !== y[index]);
        return i === -1 ? 0 : Math.sign(x[i]! - y[i]!);
      },
    },
  };
});

const mod = (
  id: string,
  options: { version?: string; moduleIds?: string[] } = {},
): IBannerlordMod =>
  ({
    id,
    type: "",
    state: "installed",
    attributes: {
      ...(options.version !== undefined && { version: options.version }),
      ...(options.moduleIds !== undefined && {
        subModsIds: options.moduleIds,
      }),
    },
  }) as unknown as IBannerlordMod;

const profile = (modState?: Record<string, { enabled: boolean }>) =>
  ({
    id: "p1",
    gameId: "mountandblade2bannerlord",
    ...(modState !== undefined && { modState }),
  }) as unknown as types.IProfile;

describe("isModActive", () => {
  it("is true only for a mod enabled in the profile", () => {
    const harmony = mod("harmony");

    expect(isModActive(profile({ harmony: { enabled: true } }), harmony)).toBe(
      true,
    );
    expect(isModActive(profile({ harmony: { enabled: false } }), harmony)).toBe(
      false,
    );
    expect(isModActive(profile({}), harmony)).toBe(false);
  });

  it("is false without a profile or a profile without mod states", () => {
    expect(isModActive(undefined, mod("harmony"))).toBe(false);
    expect(isModActive(profile(), mod("harmony"))).toBe(false);
  });
});

describe("findMod", () => {
  it("finds the mod that provides the module", () => {
    const harmony = mod("harmony", { moduleIds: ["Bannerlord.Harmony"] });
    const mods = {
      harmony,
      uiextender: mod("uiextender", { moduleIds: ["Bannerlord.UIExtenderEx"] }),
    };

    expect(findMod(mods, "Bannerlord.Harmony")).toBe(harmony);
  });

  it("matches module ids exactly", () => {
    const mods = {
      harmony: mod("harmony", { moduleIds: ["Bannerlord.Harmony"] }),
      noIds: mod("noIds"),
    };

    expect(findMod(mods, "bannerlord.harmony")).toBeUndefined();
    expect(findMod(mods, "Bannerlord")).toBeUndefined();
  });

  it("picks the newest version when several mods provide the module", () => {
    const older = mod("older", {
      version: "2.3.0",
      moduleIds: ["Bannerlord.Harmony"],
    });
    const newest = mod("newest", {
      version: "2.10.0",
      moduleIds: ["Bannerlord.Harmony"],
    });
    const middle = mod("middle", {
      version: "2.4.1",
      moduleIds: ["Bannerlord.Harmony"],
    });

    expect(findMod({ older, newest, middle }, "Bannerlord.Harmony")).toBe(
      newest,
    );
    expect(findMod({ newest, older, middle }, "Bannerlord.Harmony")).toBe(
      newest,
    );
  });

  it("picks the last of mods with the same version", () => {
    const first = mod("first", {
      version: "1.0.0",
      moduleIds: ["Bannerlord.Harmony"],
    });
    const second = mod("second", {
      version: "1.0.0",
      moduleIds: ["Bannerlord.Harmony"],
    });

    expect(findMod({ first, second }, "Bannerlord.Harmony")).toBe(second);
  });
});

describe("findModByPredicate", () => {
  it("is undefined when no mod matches", () => {
    expect(findModByPredicate({ a: mod("a") }, () => false)).toBeUndefined();
    expect(findModByPredicate({}, () => true)).toBeUndefined();
  });
});

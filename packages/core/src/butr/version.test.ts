import { describe, expect, it } from "vitest";
import { types as vetypes } from "@butr/vortexextensionnative";
import {
  getVersion,
  getVersionRangeString,
  getVersionString,
  isVersionEmpty,
  isVersionRangeEmpty,
  versionToString,
} from "./version";

const { ApplicationVersionType } = vetypes;

const version = (
  applicationVersionType: vetypes.ApplicationVersionType,
  major: number,
  minor = 0,
  revision = 0,
  changeSet = 0,
): vetypes.ApplicationVersion => ({
  applicationVersionType,
  major,
  minor,
  revision,
  changeSet,
});

const EMPTY = version(ApplicationVersionType.Alpha, 0);

const metadata = (
  options: {
    version?: vetypes.ApplicationVersion;
    versionRange?: vetypes.ApplicationVersionRange;
  } = {},
): vetypes.DependentModuleMetadata =>
  ({
    id: "Bannerlord.Harmony",
    version: options.version ?? EMPTY,
    versionRange: options.versionRange ?? { min: EMPTY, max: EMPTY },
  }) as unknown as vetypes.DependentModuleMetadata;

describe("versionToString", () => {
  it.each([
    [ApplicationVersionType.Alpha, "a1.2.3.4"],
    [ApplicationVersionType.Beta, "b1.2.3.4"],
    [ApplicationVersionType.Development, "d1.2.3.4"],
    [ApplicationVersionType.EarlyAccess, "e1.2.3.4"],
    [ApplicationVersionType.Release, "v1.2.3.4"],
  ])("prefixes a %s version with its letter", (type, expected) => {
    expect(versionToString(version(type, 1, 2, 3, 4))).toBe(expected);
  });

  it("has no prefix for an Invalid version", () => {
    expect(
      versionToString(version(ApplicationVersionType.Invalid, 1, 2, 3, 4)),
    ).toBe("1.2.3.4");
  });

  it("formats the version the mod analyzer and the game use", () => {
    expect(
      versionToString(version(ApplicationVersionType.Release, 1, 2, 12, 0)),
    ).toBe("v1.2.12.0");
  });
});

describe("isVersionEmpty", () => {
  it("is empty only for a0.0.0.0", () => {
    expect(isVersionEmpty(EMPTY)).toBe(true);
    expect(isVersionEmpty(version(ApplicationVersionType.Release, 0))).toBe(
      false,
    );
    expect(
      isVersionEmpty(version(ApplicationVersionType.Alpha, 0, 0, 0, 1)),
    ).toBe(false);
  });

  it("treats a range as empty only when both ends are", () => {
    expect(isVersionRangeEmpty({ min: EMPTY, max: EMPTY })).toBe(true);
    expect(
      isVersionRangeEmpty({
        min: EMPTY,
        max: version(ApplicationVersionType.Release, 1),
      }),
    ).toBe(false);
  });
});

describe("getVersion", () => {
  it("prefers the exact version over the range", () => {
    const result = getVersion(
      metadata({
        version: version(ApplicationVersionType.Release, 2, 1),
        versionRange: {
          min: version(ApplicationVersionType.Release, 1),
          max: version(ApplicationVersionType.Release, 3),
        },
      }),
    );

    expect(result).toBe(" >= v2.1.0.0");
  });

  it("falls back to the range when no exact version is set", () => {
    const result = getVersion(
      metadata({
        versionRange: {
          min: version(ApplicationVersionType.Release, 1),
          max: version(ApplicationVersionType.Release, 3),
        },
      }),
    );

    expect(result).toBe(" >= v1.0.0.0 <= v3.0.0.0");
  });

  it("is empty without a version or a range", () => {
    expect(getVersion(metadata())).toBe("");
  });
});

describe("getVersionString", () => {
  it("is empty for a missing or empty version", () => {
    expect(getVersionString(undefined)).toBe("");
    expect(getVersionString(EMPTY)).toBe("");
  });

  it("is the version with a leading space", () => {
    expect(getVersionString(version(ApplicationVersionType.Beta, 1, 5))).toBe(
      " b1.5.0.0",
    );
  });
});

describe("getVersionRangeString", () => {
  it("is empty for a missing or empty range", () => {
    expect(getVersionRangeString(undefined)).toBe("");
    expect(getVersionRangeString({ min: EMPTY, max: EMPTY })).toBe("");
  });

  it("is both ends of the range", () => {
    expect(
      getVersionRangeString({
        min: version(ApplicationVersionType.Release, 1),
        max: version(ApplicationVersionType.Release, 1, 3),
      }),
    ).toBe(" v1.0.0.0 - v1.3.0.0");
  });
});

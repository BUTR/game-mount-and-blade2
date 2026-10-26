import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { findModDownload, getModuleAttributes } from "./modFinder";
import { GAME_ID } from "../common";
import { IBannerlordMod } from "../types";

vi.mock("@butr/vortexextensionnative", () => ({}));

const download = (
  options: {
    state?: string;
    game?: string[];
    fileTime?: number;
    modInfo?: Record<string, unknown>;
  } = {},
): types.IDownload =>
  ({
    state: options.state ?? "finished",
    game: options.game ?? [GAME_ID],
    fileTime: options.fileTime ?? 0,
    modInfo: options.modInfo,
  }) as unknown as types.IDownload;

const nexusIds = (modId: number, fileId: number): Record<string, unknown> => ({
  nexus: { ids: { modId, fileId } },
});

const apiWith = (
  files: Record<string, types.IDownload> = {},
  mods: Record<string, IBannerlordMod> = {},
): types.IExtensionApi =>
  ({
    getState: () => ({
      persistent: { downloads: { files }, mods: { [GAME_ID]: mods } },
    }),
  }) as unknown as types.IExtensionApi;

describe("findModDownload", () => {
  it("finds the mod's download by the ids in any of Vortex's metadata locations", () => {
    expect(
      findModDownload(
        apiWith({
          dl: download({ modInfo: { meta: { details: { modId: "2006" } } } }),
        }),
        2006,
      ),
    ).toBe("dl");
    expect(
      findModDownload(
        apiWith({ dl: download({ modInfo: nexusIds(2006, 1) }) }),
        2006,
      ),
    ).toBe("dl");
    expect(
      findModDownload(
        apiWith({ dl: download({ modInfo: { ids: { modId: 2006 } } }) }),
        2006,
      ),
    ).toBe("dl");
  });

  it("prefers the metadata details over the other locations", () => {
    const api = apiWith({
      dl: download({
        modInfo: {
          meta: { details: { modId: 1 } },
          nexus: { ids: { modId: 2006 } },
        },
      }),
    });

    expect(findModDownload(api, 1)).toBe("dl");
    expect(findModDownload(api, 2006)).toBeUndefined();
  });

  it("ignores unfinished downloads and downloads for other games", () => {
    const api = apiWith({
      paused: download({ state: "paused", modInfo: nexusIds(2006, 1) }),
      skyrim: download({ game: ["skyrimse"], modInfo: nexusIds(2006, 1) }),
    });

    expect(findModDownload(api, 2006)).toBeUndefined();
  });

  it("gives the most recent download of the mod", () => {
    const api = apiWith({
      old: download({ fileTime: 100, modInfo: nexusIds(2006, 1) }),
      latest: download({ fileTime: 300, modInfo: nexusIds(2006, 2) }),
      middle: download({ fileTime: 200, modInfo: nexusIds(2006, 3) }),
      otherMod: download({ fileTime: 400, modInfo: nexusIds(1, 4) }),
    });

    expect(findModDownload(api, 2006)).toBe("latest");
  });

  it("matches the file when one is asked for", () => {
    const api = apiWith({
      old: download({ fileTime: 100, modInfo: nexusIds(2006, 1) }),
      latest: download({ fileTime: 300, modInfo: nexusIds(2006, 2) }),
    });

    expect(findModDownload(api, 2006, 1)).toBe("old");
    expect(findModDownload(api, 2006, 99)).toBeUndefined();
  });

  it("finds nothing for downloads without Nexus Mods ids", () => {
    expect(
      findModDownload(apiWith({ dl: download({ modInfo: {} }) }), 2006),
    ).toBeUndefined();
    expect(findModDownload(apiWith({ dl: download() }), 2006)).toBeUndefined();
  });
});

describe("getModuleAttributes", () => {
  const mod = (id: string, attributes?: Record<string, unknown>) =>
    ({ id, type: "", attributes }) as unknown as IBannerlordMod;

  it("lists every mod providing the module with its binary flags", () => {
    const api = apiWith(
      {},
      {
        harmony: mod("harmony", {
          subModsIds: ["Bannerlord.Harmony"],
          source: "nexus",
          steamBinariesOnXbox: true,
        }),
        harmonyCopy: mod("harmonyCopy", {
          subModsIds: ["Bannerlord.Harmony", "Other"],
          obfuscatedBinaries: true,
        }),
        unrelated: mod("unrelated", {
          subModsIds: ["Bannerlord.UIExtenderEx"],
        }),
        noIds: mod("noIds", {}),
        noAttributes: mod("noAttributes"),
      },
    );

    expect(getModuleAttributes(api, "Bannerlord.Harmony")).toEqual([
      {
        id: "harmony",
        source: "nexus",
        hasSteamBinariesOnXbox: true,
        hasObfuscatedBinaries: false,
      },
      {
        id: "harmonyCopy",
        source: undefined,
        hasSteamBinariesOnXbox: false,
        hasObfuscatedBinaries: true,
      },
    ]);
  });

  it("is empty when no mod provides the module", () => {
    expect(getModuleAttributes(apiWith(), "Bannerlord.Harmony")).toEqual([]);
  });
});

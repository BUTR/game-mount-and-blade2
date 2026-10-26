import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { buildCompatibilityCache, getCompatibilityScoresAsync } from "./utils";
import { ModAnalyzerProxy } from "./modAnalyzerProxy";
import { VortexLauncherManager } from "../launcher/manager";

vi.mock("../launcher/manager", () => ({
  VortexLauncherManager: { getInstance: vi.fn() },
}));

vi.mock("./modAnalyzerProxy", () => ({
  ModAnalyzerProxy: vi.fn(function (this: { analyzeAsync: unknown }) {
    this.analyzeAsync = vi.fn(async () => ({
      modules: [
        {
          moduleId: "Bannerlord.Harmony",
          compatibility: 98.5,
          recommendedCompatibility: null,
          recommendedModuleVersion: null,
        },
      ],
    }));
  }),
}));

const module = (
  id: string,
  major: number,
): vetypes.ModuleInfoExtendedWithMetadata =>
  ({
    id,
    version: {
      applicationVersionType: vetypes.ApplicationVersionType.Release,
      major,
      minor: 2,
      revision: 3,
      changeSet: 4,
    },
  }) as unknown as vetypes.ModuleInfoExtendedWithMetadata;

describe("buildCompatibilityCache", () => {
  it("keys the analyzer's results by module id", () => {
    const cache = buildCompatibilityCache([
      {
        moduleId: "Bannerlord.Harmony",
        compatibility: 98.5,
        recommendedCompatibility: null,
        recommendedModuleVersion: null,
      },
      {
        moduleId: "Bannerlord.UIExtenderEx",
        compatibility: 40,
        recommendedCompatibility: 95,
        recommendedModuleVersion: "v2.12.0.0",
      },
    ]);

    expect(cache).toEqual({
      "Bannerlord.Harmony": {
        score: 98.5,
        recommendedScore: null,
        recommendedVersion: null,
      },
      "Bannerlord.UIExtenderEx": {
        score: 40,
        recommendedScore: 95,
        recommendedVersion: "v2.12.0.0",
      },
    });
  });

  it("is empty for no modules", () => {
    expect(buildCompatibilityCache([])).toEqual({});
  });
});

describe("getCompatibilityScoresAsync", () => {
  const api = {} as types.IExtensionApi;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(VortexLauncherManager.getInstance).mockReturnValue({
      getAllModulesAsync: async () => ({
        "Bannerlord.Harmony": module("Bannerlord.Harmony", 2),
        Native: module("Native", 1),
      }),
      getGameVersionVortexAsync: async () => "v1.2.12.0",
    } as unknown as VortexLauncherManager);
  });

  it("asks the analyzer about the installed modules in the game's version format", async () => {
    const cache = await getCompatibilityScoresAsync(api);

    const proxy = vi.mocked(ModAnalyzerProxy).mock.instances[0] as unknown as {
      analyzeAsync: ReturnType<typeof vi.fn>;
    };
    expect(proxy.analyzeAsync).toHaveBeenCalledWith(api, {
      gameVersion: "v1.2.12.0",
      modules: [
        { moduleId: "Bannerlord.Harmony", moduleVersion: "v2.2.3.4" },
        { moduleId: "Native", moduleVersion: "v1.2.3.4" },
      ],
    });
    expect(cache).toEqual({
      "Bannerlord.Harmony": {
        score: 98.5,
        recommendedScore: null,
        recommendedVersion: null,
      },
    });
  });
});

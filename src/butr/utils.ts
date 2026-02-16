import { types } from "vortex-api";
import {
  IModAnalyzerRequestModule,
  IModAnalyzerRequestQuery,
  IModAnalyzerResultModule,
  IModuleCompatibilityInfoCache,
} from "./types";
import { ModAnalyzerProxy } from "./modAnalyzerProxy";
import { VortexLauncherManager } from "../launcher";
import { versionToString } from "./version";

export const buildCompatibilityCache = (
  modules: IModAnalyzerResultModule[],
): IModuleCompatibilityInfoCache => {
  return modules.reduce<IModuleCompatibilityInfoCache>((map, curr) => {
    map[curr.moduleId] = {
      score: curr.compatibility,
      recommendedScore: curr.recommendedCompatibility,
      recommendedVersion: curr.recommendedModuleVersion,
    };
    return map;
  }, {});
};

export const getCompatibilityScoresAsync = async (
  api: types.IExtensionApi,
): Promise<IModuleCompatibilityInfoCache> => {
  const launcherManager = VortexLauncherManager.getInstance(api);
  const allModules = await launcherManager.getAllModulesAsync();
  const gameVersion = await launcherManager.getGameVersionVortexAsync();

  const proxy = new ModAnalyzerProxy();
  const query: IModAnalyzerRequestQuery = {
    gameVersion: gameVersion,
    modules: Object.values(allModules).map<IModAnalyzerRequestModule>((x) => ({
      moduleId: x.id,
      moduleVersion: versionToString(x.version),
    })),
  };
  const result = await proxy.analyzeAsync(api, query);
  return buildCompatibilityCache(result.modules);
};

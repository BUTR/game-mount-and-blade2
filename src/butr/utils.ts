import { types } from 'vortex-api';
import { IModAnalyzerRequestModule, IModAnalyzerRequestQuery, IModuleCompatibilityInfoCache } from './types';
import { ModAnalyzerProxy } from './modAnalyzerProxy';
import { versionToString, VortexLauncherManager } from '../launcher';

export const getCompatibilityScoresAsync = async (api: types.IExtensionApi): Promise<IModuleCompatibilityInfoCache> => {
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
  return result.modules.reduce<IModuleCompatibilityInfoCache>((map, curr) => {
    map[curr.moduleId] = {
      score: curr.compatibility,
      recommendedScore: curr.recommendedCompatibility,
      recommendedVersion: curr.recommendedModuleVersion,
    };
    return map;
  }, {});
};

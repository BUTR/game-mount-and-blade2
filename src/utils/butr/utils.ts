import { types } from 'vortex-api';
import { VortexLauncherManager } from '../launcher';
import { versionToString } from '../version';
import {
  IModAnalyzerRequestModule,
  IModAnalyzerRequestQuery,
  IModuleCompatibilityInfoCache,
  ModAnalyzerProxy,
} from '.';

export const getCompatibilityScores = async (api: types.IExtensionApi): Promise<IModuleCompatibilityInfoCache> => {
  const launcherManager = VortexLauncherManager.getInstance(api);

  const allModules = launcherManager.getAllModules();
  const gameVersion = launcherManager.getGameVersionVortex();

  const proxy = new ModAnalyzerProxy();
  const query: IModAnalyzerRequestQuery = {
    gameVersion: gameVersion,
    modules: Object.values(allModules).map<IModAnalyzerRequestModule>((x) => ({
      moduleId: x.id,
      moduleVersion: versionToString(x.version),
    })),
  };
  const result = await proxy.analyze(query);
  return result.modules.reduce<IModuleCompatibilityInfoCache>((map, curr) => {
    map[curr.moduleId] = {
      score: curr.compatibility,
      recommendedScore: curr.recommendedCompatibility,
      recommendedVersion: curr.recommendedModuleVersion,
    };
    return map;
  }, {});
};

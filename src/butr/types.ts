export interface IModAnalyzerRequestModule {
  moduleId: string;
  moduleVersion?: string;
}

export interface IModAnalyzerRequestQuery {
  gameVersion: string;
  modules: IModAnalyzerRequestModule[];
}

export interface IModAnalyzerResultModule {
  moduleId: string;
  compatibility: number;
  recommendedCompatibility: number | null;
  recommendedModuleVersion: string | null;
}

export interface IModAnalyzerResult {
  modules: IModAnalyzerResultModule[];
}

export interface IModuleCompatibilityInfoCache {
  [moduleId: string]: IModuleCompatibilityInfo;
}

export interface IModuleCompatibilityInfo {
  score: number;
  recommendedScore: number | null;
  recommendedVersion: string | null;
}

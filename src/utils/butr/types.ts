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
  recommendedCompatibility: number | undefined;
  recommendedModuleVersion?: string | undefined;
}

export interface IModAnalyzerResult {
  modules: IModAnalyzerResultModule[];
}

export interface IModuleCompatibilityInfoCache extends Record<
  string,
  IModuleCompatibilityInfo
> {}

export interface IModuleObfuscationCacheInfoCache extends Record<
  string,
  boolean
> {}

export interface IModuleCompatibilityInfo {
  score: number;
  recommendedScore: number | null;
  recommendedVersion: string | null;
}

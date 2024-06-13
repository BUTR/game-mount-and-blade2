import { types as vetypes } from '@butr/vortexextensionnative';

export interface ISaveGame {
  index: number;
  name: string;
  applicationVersion?: vetypes.ApplicationVersion | undefined;
  creationTime?: number | undefined;
  characterName?: string | undefined;
  mainHeroGold?: number | undefined;
  mainHeroLevel?: number | undefined;
  dayLong?: number | undefined;
  clanBannerCode?: string | undefined;
  clanFiefs?: number | undefined;
  clanInfluence?: number | undefined;
  mainPartyFood?: number | undefined;
  mainPartyHealthyMemberCount?: number | undefined;
  mainPartyPrisonerMemberCount?: number | undefined;
  mainPartyWoundedMemberCount?: number | undefined;
  version?: number | undefined; // always a 1?
  modules: { [name: string]: vetypes.ApplicationVersion }; // key value pair - name of module : version of module
  duplicateModules?: string[] | undefined;
  loadOrderIssues?: string[] | undefined;
  missingModules?: string[] | undefined;
  mismatchedModuleVersions?: string[] | undefined;
}

export type MismatchedModule = {
  name: string;
  installed: vetypes.ApplicationVersion;
  save: vetypes.ApplicationVersion;
};
export type MismatchedModuleMap = {
  [name: string]: MismatchedModule;
};

export type ModulesByName = {
  [name: string]: vetypes.ModuleInfoExtendedWithMetadata;
};

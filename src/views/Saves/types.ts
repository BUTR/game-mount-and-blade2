import { types as vetypes } from "@butr/vortexextensionnative";

export interface ISaveGame {
  readonly index: number;
  readonly name: string;
  readonly applicationVersion?: vetypes.ApplicationVersion | undefined;
  readonly creationTime?: number | undefined;
  readonly characterName?: string | undefined;
  readonly mainHeroGold?: number | undefined;
  readonly mainHeroLevel?: number | undefined;
  readonly dayLong?: number | undefined;
  readonly clanBannerCode?: string | undefined;
  readonly clanFiefs?: number | undefined;
  readonly clanInfluence?: number | undefined;
  readonly mainPartyFood?: number | undefined;
  readonly mainPartyHealthyMemberCount?: number | undefined;
  readonly mainPartyPrisonerMemberCount?: number | undefined;
  readonly mainPartyWoundedMemberCount?: number | undefined;
  readonly version?: number | undefined; // always a 1?
  readonly modules: { readonly [name: string]: vetypes.ApplicationVersion }; // key value pair - name of module : version of module
  readonly duplicateModules?: string[] | undefined;
  readonly loadOrderIssues?: string[] | undefined;
  readonly missingModules?: string[] | undefined;
  readonly mismatchedModuleVersions?: string[] | undefined;
}

export interface ISaveList {
  readonly [name: string]: ISaveGame;
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
  readonly [name: string]: vetypes.ModuleInfoExtendedWithMetadata;
};

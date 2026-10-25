import path from "path";
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import { SUB_MODS_IDS } from "../common";
import { versionToString } from "../butr/version";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IModuleCache,
  IStagedModuleInfo,
} from "../types";
import {
  getStoredModuleInfos,
  readModModulesAsync,
  toStagedModuleInfo,
} from "./moduleAttributes";

/**
 * A module as installed in Vortex, enabled or not
 */
export interface IStagedModule {
  modId: string;
  module: IStagedModuleInfo;
}

/**
 * The modules in Vortex's staging folder by module id. Several mods can provide the same module
 */
export type StagedModules = Map<string, IStagedModule[]>;

/**
 * The modules read from each mod's staging folder, by mod id, for mods without stored module entries yet.
 * The mods in the state change on every attribute update, a mod's files only when it is installed again
 */
const stagedModCache = new Map<
  string,
  { key: string; modules: IStagedModuleInfo[] }
>();

const readModModuleInfosAsync = async (
  stagingPath: string,
  mod: IBannerlordMod,
  moduleIds: string[],
): Promise<IStagedModuleInfo[]> => {
  const attributes = mod.attributes as Record<string, unknown> | undefined;
  const key = JSON.stringify([
    path.join(stagingPath, mod.installationPath),
    moduleIds,
    attributes?.["version"],
    attributes?.["installTime"],
  ]);
  const cached = stagedModCache.get(mod.id);
  if (cached?.key === key) {
    return cached.modules;
  }

  const { modules, complete } = await readModModulesAsync(stagingPath, mod);
  const infos = modules
    .filter((module) => moduleIds.includes(module.id))
    .map(toStagedModuleInfo);
  // A file that couldn't be read is tried again next time
  if (complete) {
    stagedModCache.set(mod.id, { key, modules: infos });
  }
  return infos;
};

/**
 * The modules of every installed mod, so mods the current profile doesn't deploy can still be resolved with their
 * dependencies. Read from the mod's stored module entries, or from its staging folder until it has them
 */
export const readStagedModulesAsync = async (
  stagingPath: string,
  mods: IBannerlordModStorage,
): Promise<StagedModules> => {
  const staged: StagedModules = new Map();
  for (const mod of Object.values(mods)) {
    const moduleIds = mod.attributes?.[SUB_MODS_IDS] ?? [];
    if (
      mod.state !== "installed" ||
      moduleIds.length === 0 ||
      !mod.installationPath
    ) {
      continue;
    }
    const stored = getStoredModuleInfos(mod);
    const modules =
      stored !== undefined
        ? stored.filter((module) => moduleIds.includes(module.id))
        : await readModModuleInfosAsync(stagingPath, mod, moduleIds);
    for (const module of modules) {
      const entries = staged.get(module.id) ?? [];
      entries.push({ modId: mod.id, module });
      staged.set(module.id, entries);
    }
  }
  return staged;
};

/**
 * Modules in the game folder that no Vortex mod provides: the official ones and anything installed by hand.
 * They stay in place whichever profile is deployed
 */
export const getUnmanagedModules = (
  deployed: IModuleCache,
  mods: IBannerlordModStorage,
): IModuleCache => {
  const managed = new Set(
    Object.values(mods).flatMap((mod) => mod.attributes?.[SUB_MODS_IDS] ?? []),
  );
  return Object.fromEntries(
    Object.entries(deployed).filter(([id]) => !managed.has(id)),
  );
};

/**
 * The mod with the module in the version asked for, the newest when any version does
 */
export const pickStagedModule = (
  candidates: IStagedModule[],
  wanted: string | null,
): IStagedModule | undefined => {
  if (wanted !== null) {
    return candidates.find(
      (candidate) => versionToString(candidate.module.version) === wanted,
    );
  }
  return candidates.reduce<IStagedModule | undefined>(
    (best, candidate) =>
      best === undefined ||
      BannerlordModuleManager.compareVersions(
        candidate.module.version,
        best.module.version,
      ) > 0
        ? candidate
        : best,
    undefined,
  );
};

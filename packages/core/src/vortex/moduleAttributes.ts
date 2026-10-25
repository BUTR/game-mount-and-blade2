import { actions, log, selectors, types, util } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import path from "path";
import { readFile } from "node:fs/promises";
import {
  GAME_ID,
  SUB_MODS_IDS,
  SUB_MODS_INFO,
  SUB_MODS_INFO_SCHEMA,
  SUBMODULE_SEARCH_DEPTH,
} from "../common";
import { bselectors } from "../selectors";
import {
  IBannerlordMod,
  IStagedModuleInfo,
  IStagedModulesInfo,
  IStateWithBannerlord,
} from "../types";
import { findSubModuleFilesAsync } from "../utils";

/**
 * The modules a module needs loaded with it when joining. Optional dependencies, incompatible modules and modules
 * that only have to load after it are left out
 */
export const getRequiredDependencyIds = (
  module: vetypes.ModuleInfoExtended,
): string[] =>
  BannerlordModuleManager.getDependenciesAll(module)
    .filter(
      (dependency) =>
        !dependency.isOptional &&
        !dependency.isIncompatible &&
        dependency.loadType !== vetypes.LoadType.LoadAfterThis,
    )
    .map((dependency) => dependency.id);

export const toStagedModuleInfo = (
  module: vetypes.ModuleInfoExtended,
): IStagedModuleInfo => ({
  id: module.id,
  name: module.name,
  version: module.version,
  requiredDependencyIds: getRequiredDependencyIds(module),
});

export const toStagedModulesInfo = (
  modules: vetypes.ModuleInfoExtended[],
): IStagedModulesInfo => ({
  schema: SUB_MODS_INFO_SCHEMA,
  modules: modules.map(toStagedModuleInfo),
});

/**
 * The mod's stored module entries, undefined when it has none or they were written in an older shape
 */
export const getStoredModuleInfos = (
  mod: IBannerlordMod,
): IStagedModuleInfo[] | undefined => {
  const info = mod.attributes?.[SUB_MODS_INFO];
  return info?.schema === SUB_MODS_INFO_SCHEMA ? info.modules : undefined;
};

/**
 * Reads the modules in a mod's staging folder.
 * Not complete when a SubModule.xml couldn't be read, then the result shouldn't be kept
 */
export const readModModulesAsync = async (
  stagingPath: string,
  mod: IBannerlordMod,
): Promise<{ modules: vetypes.ModuleInfoExtended[]; complete: boolean }> => {
  const folder = path.join(stagingPath, mod.installationPath);
  const modules: vetypes.ModuleInfoExtended[] = [];
  let complete = true;
  for (const file of await findSubModuleFilesAsync(
    folder,
    SUBMODULE_SEARCH_DEPTH,
  )) {
    const xml = await readFile(file, "utf8").catch(() => null);
    if (xml === null) {
      complete = false;
      continue;
    }
    const module = BannerlordModuleManager.getModuleInfo(xml);
    if (module?.id && !modules.some((other) => other.id === module.id)) {
      modules.push(module);
    }
  }
  return { modules, complete };
};

const needsInfo = (mod: IBannerlordMod): boolean =>
  getStoredModuleInfos(mod) === undefined;

/**
 * A mod read before keeps its module entries even when it has no module, like BLSE or a translation.
 * Those get no module ids, so the entries are what says they were read
 */
const needsIds = (mod: IBannerlordMod): boolean =>
  mod.attributes?.[SUB_MODS_IDS] === undefined && needsInfo(mod);

/**
 * Records the modules of mods from their staging folder, when the extension's installer didn't.
 * - The module ids: only that installer records them, so a mod installed by a FOMOD installer, which Vortex runs
 *   first, or by the old Vortex extension has none. The Load Order then shows its modules as 'Not managed by Vortex'
 * - The module entries the Servers and Saves pages need, for mods installed before the installer kept them. Once
 *   stored, those pages don't read the mod's staging folder again
 *
 * @param options.modIds only these mods, for example the one just installed
 * @param options.idsOnly only mods without module ids, the ones the Load Order needs before it can be read
 */
export const fillModuleAttributesAsync = async (
  api: types.IExtensionApi,
  options: { modIds?: string[]; idsOnly?: boolean } = {},
): Promise<void> => {
  const { modIds, idsOnly = false } = options;

  const state = api.getState<IStateWithBannerlord>();
  const stagingPath = selectors.installPathForGame(state, GAME_ID);
  if (!stagingPath) {
    return;
  }

  const mods = Object.values(bselectors.bannerlordMods(state)).filter(
    (mod) =>
      (modIds === undefined || modIds.includes(mod.id)) &&
      mod.state === "installed" &&
      !!mod.installationPath &&
      (needsIds(mod) || (!idsOnly && needsInfo(mod))),
  );

  const updates: ReturnType<typeof actions.setModAttribute>[] = [];
  for (const mod of mods) {
    try {
      const { modules, complete } = await readModModulesAsync(stagingPath, mod);
      // A file that couldn't be read is tried on the next activation, a partial list would be kept for good
      if (!complete) {
        continue;
      }
      const ids = mod.attributes?.[SUB_MODS_IDS] ?? modules.map((x) => x.id);
      if (needsIds(mod) && ids.length > 0) {
        updates.push(
          actions.setModAttribute(GAME_ID, mod.id, SUB_MODS_IDS, ids),
        );
      }
      if (needsInfo(mod)) {
        updates.push(
          actions.setModAttribute(
            GAME_ID,
            mod.id,
            SUB_MODS_INFO,
            toStagedModulesInfo(modules.filter((x) => ids.includes(x.id))),
          ),
        );
      }
    } catch (err) {
      log("warn", "Failed to read the modules of a mod", {
        modId: mod.id,
        err,
      });
    }
  }

  if (updates.length > 0 && api.store !== undefined) {
    log("info", "Recorded the modules of mods from their staging folder", {
      mods: mods.length,
    });
    // One state change, the Servers page re-reads the staged modules on each
    util.batchDispatch(api.store.dispatch, updates);
  }
};

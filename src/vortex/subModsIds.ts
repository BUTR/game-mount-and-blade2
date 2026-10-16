import { actions, log, selectors, types, util } from "@nexusmods/vortex-api";
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import path from "path";
import { readFile } from "node:fs/promises";
import { GAME_ID, SUB_MODS_IDS, SUBMODULE_SEARCH_DEPTH } from "../common";
import { bselectors } from "../selectors";
import { IBannerlordMod, IStateWithBannerlord } from "../types";
import { findSubModuleFilesAsync } from "../utils";

/**
 * Mods already looked at this session that provide no module, like BLSE or a translation, so they aren't read again
 */
const modsWithoutModules = new Set<string>();

const readModuleIdsAsync = async (
  stagingPath: string,
  mod: IBannerlordMod,
): Promise<string[]> => {
  const folder = path.join(stagingPath, mod.installationPath);
  const ids: string[] = [];
  for (const file of await findSubModuleFilesAsync(
    folder,
    SUBMODULE_SEARCH_DEPTH,
  )) {
    const xml = await readFile(file, "utf8").catch(() => null);
    const module =
      xml !== null ? BannerlordModuleManager.getModuleInfo(xml) : undefined;
    if (module?.id && !ids.includes(module.id)) {
      ids.push(module.id);
    }
  }
  return ids;
};

/**
 * Records the modules of mods the extension's installer didn't install.
 * Only that installer records them, so a mod installed by a FOMOD installer, which Vortex runs first, or by the old
 * Vortex extension has none. The Load Order then shows its modules as 'Not managed by Vortex', and the Servers page
 * doesn't know the mod provides them
 */
export const fillMissingSubModsIdsAsync = async (
  api: types.IExtensionApi,
  modIds?: string[],
): Promise<void> => {
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
      mod.attributes?.[SUB_MODS_IDS] === undefined &&
      !modsWithoutModules.has(mod.id),
  );

  const updates: ReturnType<typeof actions.setModAttribute>[] = [];
  for (const mod of mods) {
    try {
      const ids = await readModuleIdsAsync(stagingPath, mod);
      if (ids.length === 0) {
        modsWithoutModules.add(mod.id);
        continue;
      }
      updates.push(actions.setModAttribute(GAME_ID, mod.id, SUB_MODS_IDS, ids));
    } catch (err) {
      log("warn", "Failed to read the modules of a mod", {
        modId: mod.id,
        err,
      });
    }
  }

  if (updates.length > 0 && api.store !== undefined) {
    log(
      "info",
      "Recorded the modules of mods installed without the extension",
      {
        count: updates.length,
      },
    );
    util.batchDispatch(api.store.dispatch, updates);
  }
};

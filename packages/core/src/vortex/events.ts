import { fs, selectors, types, util } from "@nexusmods/vortex-api";
import path from "path";
import { copyFile, rm } from "node:fs/promises";
import { GAME_ID } from "../common";
import { bselectors } from "../selectors";
import { IAddedFiles, IStateWithBannerlord } from "../types";
import { vortexStoreToLibraryStore } from "./store";
import { LocalizationManager } from "../localization/manager";

/**
 * Event function, be careful
 */
export const addedFilesEventAsync = async (
  api: types.IExtensionApi,
  files: IAddedFiles[],
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();

  const discovery = selectors.discoveryByGame(state, GAME_ID);
  if (discovery?.path === undefined) {
    // Can't do anything without a discovery path.
    return;
  }

  const game = util.getGame(GAME_ID);
  const modPaths = game.getModPaths?.(discovery.path) ?? {};
  const installPath = selectors.installPathForGame(state, game.id);
  if (installPath === undefined) {
    // Can't do anything without a install path.
    return;
  }

  const handleFileAsync = async (entry: {
    filePath: string;
    candidates: string[];
  }): Promise<void> => {
    // only act if we definitively know which mod owns the file
    if (entry.candidates.length !== 1) {
      return;
    }

    const mod = bselectors.bannerlordModById(state, entry.candidates[0]!);
    if (!mod) {
      return;
    }

    const relPath = path.relative(modPaths[mod.type ?? ``]!, entry.filePath);
    const targetPath = path.join(installPath, mod.id, relPath);

    try {
      // copy the new file back into the corresponding mod, then delete it.
      // That way, vortex will create a link to it with the correct
      // deployment method and not ask the user any questions
      await fs.ensureDirAsync(path.dirname(targetPath));

      // Remove the target destination file if it exists.
      // this is to completely avoid a scenario where we may attempt to
      // copy the same file onto itself.
      await rm(targetPath, { force: true });

      await copyFile(entry.filePath, targetPath);

      await rm(entry.filePath);
    } catch (err) {
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(
        t("Failed to import generated file into mod"),
        err,
      );
    }
  };

  await Promise.all(files.map(handleFileAsync));
};

export const installedMod = (
  api: types.IExtensionApi,
  archiveId: string,
  modId: string,
): void => {
  const state = api.getState<IStateWithBannerlord>();

  const mod = bselectors.bannerlordModById(state, modId);
  if (mod === undefined) {
    return;
  }

  const supportedStores = mod.attributes?.availableStores ?? [];
  if (supportedStores.length === 0) {
    return;
  }

  const discovery = selectors.discoveryByGame(state, GAME_ID);
  if (!discovery || discovery.store === undefined) {
    return;
  }

  const store = vortexStoreToLibraryStore(discovery.store);
  // A store the extension doesn't know can't be compared with the mod's
  if (store === "Unknown" || supportedStores.includes(store)) {
    return;
  }

  // The mod has no binaries for the game's store. On Xbox the player picked this in the installer's dialog,
  // otherwise it's a surprise, and a mod that disappears right after installing reads as a Vortex bug
  const { localize: t } = LocalizationManager.getInstance(api);
  api.sendNotification?.({
    type: "warning",
    message: t(
      `'{{name}}' was removed because it does not include binaries for the {{store}} version of the game.`,
      { replace: { name: util.renderModName(mod), store: store } },
    ),
  });
  // Removes the mod's files too, removing only its entry would leave them in the staging folder
  util.removeMods(api, GAME_ID, [modId]).catch((err) => {
    api.showErrorNotification?.(t("Failed to remove the mod"), err);
  });
};

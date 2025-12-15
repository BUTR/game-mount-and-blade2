import Bluebird from 'bluebird';
import { actions, fs, selectors, types, util } from 'vortex-api';
import path from 'path';
import { copyFile, rm } from 'node:fs/promises';
import { hasPersistentBannerlordMods } from './utils';
import { GAME_ID } from '../common';
import { IAddedFiles } from '../types';
import { vortexStoreToLibraryStore } from '../launcher';
import { LocalizationManager } from '../localization';

/**
 * Event function, be careful
 */
export const addedFilesEventAsync = async (api: types.IExtensionApi, files: IAddedFiles[]): Promise<void> => {
  const state = api.getState();

  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(state, GAME_ID);
  if (discovery?.path === undefined) {
    // Can't do anything without a discovery path.
    return;
  }

  const game = util.getGame(GAME_ID);
  const modPaths = game.getModPaths?.(discovery.path) ?? {};
  const installPath: string | undefined = selectors.installPathForGame(state, game.id);
  if (installPath === undefined) {
    // Can't do anything without a install path.
    return;
  }

  const handleFileAsync = async (entry: { filePath: string; candidates: string[] }): Promise<void> => {
    // only act if we definitively know which mod owns the file
    if (entry.candidates.length !== 1) {
      return;
    }

    const mod = state.persistent.mods[game.id]?.[entry.candidates[0]!];
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
      await rm(targetPath);

      await copyFile(entry.filePath, targetPath);

      await rm(entry.filePath);
    } catch (err) {
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t('Failed to import added file to mod!'), err);
    }
  };

  await Bluebird.map<IAddedFiles, void>(files, handleFileAsync);
};

export const installedMod = (api: types.IExtensionApi, archiveId: string, modId: string): void => {
  const state = api.getState();

  if (!hasPersistentBannerlordMods(state.persistent)) {
    return;
  }
  const mod = state.persistent.mods.mountandblade2bannerlord[modId];
  if (mod === undefined) {
    return;
  }

  const supportedStores = mod.attributes?.availableStores ?? [];
  if (supportedStores.length === 0) {
    return;
  }

  const discovery = selectors.discoveryByGame(state, GAME_ID);
  if (discovery === undefined) {
    return;
  }

  const store = vortexStoreToLibraryStore(discovery.store);
  if (supportedStores.includes(store)) {
    return;
  }

  // uninstall mod if store is not supported by the mod
  api.store?.dispatch(actions.removeMod(GAME_ID, modId));
};

import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import path from "path";
import { fs, log, selectors, types, util } from "vortex-api";
import { GAME_ID } from "../common";
import { IAddedFiles } from "../types";

export const addedFiles = async (api: types.IExtensionApi, profileId: string, files: IAddedFiles[]) => {
  const state = api.getState();

  const profile = selectors.profileById(state, profileId);
  if (profile.gameId !== GAME_ID) {
    return;
  }

  const game = util.getGame(GAME_ID);
  const discovery = selectors.discoveryByGame(state, GAME_ID);
  if (!discovery?.path) { // Can't do anything without a discovery path.
    return;
  }
  const modPaths = game.getModPaths ? game.getModPaths(discovery.path) : {};
  const installPath = selectors.installPathForGame(state, GAME_ID);

  await Promise.map(files, async (entry: { filePath: string; candidates: string[] }) => {
    // only act if we definitively know which mod owns the file
    if (entry.candidates.length === 1) {
      const mod = util.getSafe<types.IMod | undefined>(
        state.persistent.mods,
        [GAME_ID, entry.candidates[0]!],
        undefined
      );
      if (!mod) {
          return;
      }
      const relPath = path.relative(modPaths[mod.type ?? ``]!, entry.filePath);
      const targetPath = path.join(installPath, mod.id, relPath);
      // copy the new file back into the corresponding mod, then delete it.
      //  That way, vortex will create a link to it with the correct
      //  deployment method and not ask the user any questions
      await fs.ensureDirAsync(path.dirname(targetPath));

      // Remove the target destination file if it exists.
      //  this is to completely avoid a scenario where we may attempt to
      //  copy the same file onto itself.
      await fs.removeAsync(targetPath);
      try {
        await fs.copyAsync(entry.filePath, targetPath);
        await fs.removeAsync(entry.filePath);
      } catch (err) {
        if (err instanceof Error) {
        log(`error`, `failed to import added file to mod`, err.message);
        }
      }
    }
  });
};
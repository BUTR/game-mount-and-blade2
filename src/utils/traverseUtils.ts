import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { fs, log } from 'vortex-api';

export const walkAsync = toBluebird<string[], string, number | void>(async (dir: string, levelsDeep: number | void = 2) => {
  let entries = Array<string>();
  const files = await fs.readdirAsync(dir);
  const filtered = files.filter((file) => !file.endsWith(`.vortex_backup`));
  await Promise.each(filtered, async (file_1) => {
    const fullPath = path.join(dir, file_1);
    try {
      const stats = await fs.statAsync(fullPath);
      if (stats.isDirectory() && levelsDeep > 0) {
        const nestedFiles = await walkAsync(fullPath, (levelsDeep || 2) - 1);
        entries = entries.concat(nestedFiles);
      } else {
        entries.push(fullPath);
      }
    } catch (err: any) {
      // This is a valid use case, particularly if the file
      //  is deployed by Vortex using symlinks, and the mod does
      //  not exist within the staging folder.
      log(`error`, `MnB2: invalid symlink`, err);
      if (err.code !== `ENOENT`) throw err;
    }
  });
  return entries;
});
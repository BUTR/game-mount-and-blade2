import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { fs } from 'vortex-api';
import { IInstallResult, IInstruction } from 'vortex-api/lib/types/api';
import { createBannerlordModuleManager } from '../utils/bmm';
import { MODULES, SUBMOD_FILE, ROOT_FOLDERS } from '../common';

export const installRootMod = toBluebird(async (files: string[], destinationPath: string): Promise<IInstallResult> => {
  const bmm = await createBannerlordModuleManager();

  const moduleFile = files.find((file) => file.split(path.sep).indexOf(MODULES) !== -1) || ``;
  const idx = moduleFile.split(path.sep).indexOf(MODULES);
  const subMods = files.filter((file) => path.basename(file).toLowerCase() === SUBMOD_FILE);
  // This was changed from Promise.map() to Promise.all() but should work the same
  const subModIds = await Promise.all(subMods.map(async (modFile: string) => {
    const xmlData = await fs.readFileAsync(path.join(destinationPath, modFile), { encoding: `utf-8` });
    const subModule = bmm.getModuleInfo(xmlData);
    return subModule?.id || ``;
  }));
  const filtered = files.filter((file_2) => {
    const segments = file_2.split(path.sep).map((seg) => seg.toLowerCase());
    const lastElementIdx = segments.length - 1;

    // Ignore directories and ensure that the file contains a known root folder at the expected index.
    return (ROOT_FOLDERS.has(segments[idx]) && (path.extname(segments[lastElementIdx]) !== ``));
  });
  const attributes: IInstruction[] = subModIds.length > 0
    ? [{
      type: `attribute`,
      key: `subModIds`,
      value: subModIds,
    }]
    : [];
  const instructions = attributes.concat(filtered.map((file_3) => {
    const destination = file_3.split(path.sep).slice(idx).join(path.sep);
    return {
      type: `copy`,
      source: file_3,
      destination,
    };
  }));
  return { instructions };
});

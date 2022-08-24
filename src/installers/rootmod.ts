import { GAME_ID, MODULES, SUBMOD_FILE, ROOT_FOLDERS } from '../common';
import { getElementValue } from '../util';
import path from 'path';
import { types } from 'vortex-api';

function testRootMod(files: string[], gameId: string) {
    const notSupported = { supported: false, requiredFiles: [] };
    if (gameId !== GAME_ID) {
        // Different game.
        return Promise.resolve(notSupported);
    }

    const lowered = files.map(file => file.toLowerCase());
    const modsFile = lowered.find(file => file.split(path.sep).indexOf(MODULES.toLowerCase()) !== -1);
    if (modsFile === undefined) {
        // There's no Modules folder.
        return Promise.resolve(notSupported);
    }

    const idx = modsFile.split(path.sep).indexOf(MODULES.toLowerCase());
    const rootFolderMatches = lowered.filter(file => {
        const segments = file.split(path.sep);
        return (((segments.length - 1) > idx) && ROOT_FOLDERS.has(segments[idx]));
    }) || [];

    return Promise.resolve({ supported: (rootFolderMatches.length > 0), requiredFiles: [] });
}

function installRootMod(files: string[], destinationPath: string): Promise<types.IInstallResult> {
    const moduleFile = files.find(file => file.split(path.sep).indexOf(MODULES) !== -1);
    const idx = moduleFile.split(path.sep).indexOf(MODULES);
    const subMods = files.filter(file => path.basename(file).toLowerCase() === SUBMOD_FILE);
    // This was changed from Bluebird.map() to Promise.all() but should work the same
    return Promise.all(subMods.map(async (modFile: string) => {
      const subModId = await getElementValue(path.join(destinationPath, modFile), 'Id');
      return Promise.resolve(subModId);
    }))
    .then((subModIds: string[]) => {
      const filtered = files.filter(file => {
        const segments = file.split(path.sep).map(seg => seg.toLowerCase());
        const lastElementIdx = segments.length - 1;
  
        // Ignore directories and ensure that the file contains a known root folder at
        //  the expected index.
        return (ROOT_FOLDERS.has(segments[idx])
          && (path.extname(segments[lastElementIdx]) !== ''));
        });
      const attributes: types.IInstruction[] = subModIds.length > 0
        ? [
            {
              type: 'attribute',
              key: 'subModIds',
              value: subModIds,
            },
          ]
        : [];
      const instructions = attributes.concat(filtered.map(file => {
        const destination = file.split(path.sep)
                                .slice(idx)
                                .join(path.sep);
        return {
          type: 'copy',
          source: file,
          destination,
        };
      }));
  
      return Promise.resolve({ instructions });
    });
}

export { testRootMod, installRootMod };
import Promise from 'bluebird';
import * as path from 'path';

import { GAME_ID, MODULES, ROOT_FOLDERS, SUBMOD_FILE } from './constants';
import { getElementValue } from './old-xml';


export function testRootMod(files, gameId) {
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

export function installRootMod(files, destinationPath) {
  const moduleFile = files.find(file => file.split(path.sep).indexOf(MODULES) !== -1);
  const idx = moduleFile.split(path.sep).indexOf(MODULES);
  const filtered = files.filter(file => {
    const segments = file.split(path.sep).map(seg => seg.toLowerCase());
    const lastElementIdx = segments.length - 1;

    // Ignore directories and ensure that the file contains a known root folder at
    //  the expected index.
    return (ROOT_FOLDERS.has(segments[idx])
      && (path.extname(segments[lastElementIdx]) !== ''));
  });

  const instructions = filtered.map(file => {
    const destination = file.split(path.sep)
                            .slice(idx)
                            .join(path.sep);
    return {
      type: 'copy',
      source: file,
      destination,
    }
  });

  return Promise.resolve({ instructions });
}

export function testForSubmodules(files, gameId) {
  // Check this is a mod for Bannerlord and it contains a SubModule.xml
  const supported = ((gameId === GAME_ID) 
    && files.find(file => path.basename(file).toLowerCase() === SUBMOD_FILE) !== undefined);

  return Promise.resolve({
    supported,
    requiredFiles: []
  })
}

export async function installSubModules(files, destinationPath) {
  // Remove directories straight away.
  const filtered = files.filter(file => { 
    const segments = file.split(path.sep);
    return path.extname(segments[segments.length - 1]) !== '';
  });
  const subMods = filtered.filter(file => path.basename(file).toLowerCase() === SUBMOD_FILE);
  return Promise.reduce(subMods, async (accum, modFile) => {
    const segments = modFile.split(path.sep).filter(seg => !!seg);
    const modName = (segments.length > 1)
      ? segments[segments.length - 2]
      : await getElementValue(modFile, 'Id');

    const idx = modFile.toLowerCase().indexOf(SUBMOD_FILE);
    // Filter the mod files for this specific submodule.
    const subModFiles = filtered.filter(file => file.slice(0, idx) == modFile.slice(0, idx));
    const instructions = subModFiles.map(modFile => ({
      type: 'copy',
      source: modFile,
      destination: path.join(MODULES, modName, modFile.slice(idx)),
    }));
    return accum.concat(instructions);
  }, [])
  .then(merged => Promise.resolve({ instructions: merged }));
}
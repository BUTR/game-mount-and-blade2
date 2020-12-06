import Promise from 'bluebird';
import * as path from 'path';
import { IInstallResult, IInstruction, ISupportedResult } from 'vortex-api/lib/types/api';

import ConstantStorage from './constants';
import { getElementValue } from './old-xml';


const constants = new ConstantStorage();
const { GAME_ID, MODULES, ROOT_FOLDERS, SUBMOD_FILE } = constants;

export function testRootMod(files: string[], gameId: string): ISupportedResult {
  const notSupported: ISupportedResult = { supported: false, requiredFiles: [] as string[] };
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

export function installRootMod(files: string[], destinationPath: string): IInstallResult {
  const moduleFile = files.find(file => file.split(path.sep).indexOf(MODULES) !== -1);
  const idx = moduleFile.split(path.sep).indexOf(MODULES);
  const filtered = files.filter(file => {
    const segments = file.split(path.sep).map(seg => seg.toLowerCase());
    const lastElementIdx = segments.length - 1;

    // Ignore directories and ensure that the file contains a known root folder at
    //  the expected index.
    return (ROOT_FOLDERS.has(segments[idx]) && (path.extname(segments[lastElementIdx]) !== ''));
  });

  const instructions = filtered.map(file => {
    const destination = file.split(path.sep)
                            .slice(idx)
                            .join(path.sep);
    return {
      type: 'copy',
      source: file,
      destination,
    } as IInstruction
  });

  return Promise.resolve({ instructions } as IInstallResult);
}

export function testForSubmodules(files: string[], gameId: string) : ISupportedResult {
  // Check this is a mod for Bannerlord and it contains a SubModule.xml
  const supported = ((gameId === GAME_ID) && files.find(file => path.basename(file).toLowerCase() === SUBMOD_FILE) !== undefined);

  return Promise.resolve({
    supported,
    requiredFiles: [] as string[]
  } as ISupportedResult)
}

export async function installSubModules(files: string[], destinationPath: string): Promise<IInstallResult> {
  // Remove directories straight away.
  const filtered = files.filter(file => { 
    const segments = file.split(path.sep);
    return path.extname(segments[segments.length - 1]) !== '';
  });
  const subMods = filtered.filter(file => path.basename(file).toLowerCase() === SUBMOD_FILE);
  return Promise.reduce(subMods, async (accum: IInstruction[], modFile: string) => {
    const segments = modFile.split(path.sep).filter(seg => !!seg);
    const modName: string = (segments.length > 1)
      ? segments[segments.length - 2]
      : await getElementValue(modFile, 'Id');

    const idx = modFile.toLowerCase().indexOf(SUBMOD_FILE);
    // Filter the mod files for this specific submodule.
    const subModFiles = filtered.filter(file => file.slice(0, idx) == modFile.slice(0, idx));
    const instructions = subModFiles.map(modFile => ({
      type: 'copy',
      source: modFile,
      destination: path.join(MODULES, modName, modFile.slice(idx)),
    } as IInstruction));
    return accum.concat(instructions);
  }, [] as IInstruction[])
  .then((merged: IInstruction[]) => Promise.resolve({ instructions: merged } as IInstallResult));
}
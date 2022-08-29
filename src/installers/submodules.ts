//@ts-ignore
import Bluebird, { Promise } from 'bluebird';
import { method as toBluebird } from 'bluebird';

import * as path from 'path';
import { types, util } from 'vortex-api';
import { getElementValue } from '../util';
import { GAME_ID, SUBMOD_FILE, MODULES } from '../common';

export const testForSubmodules = toBluebird<types.ISupportedResult, string[], string>(async (files: string[], gameId: string): Promise<types.ISupportedResult> => {
    // Check this is a mod for Bannerlord and it contains a SubModule.xml
    const supported = ((gameId === GAME_ID)
      && files.find(file => path.basename(file).toLowerCase() === SUBMOD_FILE) !== undefined);
  
    return {
      supported,
      requiredFiles: [],
    };
});

export const installSubModules = toBluebird<types.IInstallResult, string[], string>(async (files: string[], destinationPath: string): Promise<types.IInstallResult> => {
  // Remove directories straight away.
  const filtered = files.filter(file => {
    const segments = file.split(path.sep);
    return path.extname(segments[segments.length - 1]) !== '';
  });
  const subModIds = [];
  const subMods = filtered.filter(file => path.basename(file).toLowerCase() === SUBMOD_FILE);

  const moduleInstructions = await Promise.all(subMods.map(async (modFile) => {
    const segments_1 = modFile.split(path.sep).filter(seg => !!seg);
    const subModId = await getElementValue(path.join(destinationPath, modFile), 'Id');
    const modName = (segments_1.length > 1)
      ? segments_1[segments_1.length - 2]
      : subModId;
    if (modName === undefined) {
      return Promise.reject(new util.DataInvalid('Invalid Submodule.xml file - inform the mod author'));
    }
    subModIds.push(subModId);
    const idx = modFile.toLowerCase().indexOf(SUBMOD_FILE);
    // Filter the mod files for this specific submodule.
    const subModFiles: string[] = filtered.filter(file_2 => file_2.slice(0, idx) === modFile.slice(0, idx));
    const subModinstructions: types.IInstruction[] = subModFiles.map((modFile_1: string) => ({
      type: 'copy',
      source: modFile_1,
      destination: path.join(MODULES, modName, modFile_1.slice(idx)),
    }));
    // Merge the instruction arrays.
    return subModinstructions;
  }));
  const subModsAttribute: types.IInstruction = {
    type: 'attribute',
    key: 'subModsIds',
    value: subModIds
  };
  // Push the attribute in for merging of instructions.
  moduleInstructions.push([subModsAttribute]);
  const instructions = [].concat.apply([], moduleInstructions);
  return { instructions };
});

import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import { fs, util } from 'vortex-api';
import { IInstallResult, IInstruction } from 'vortex-api/lib/types/api';
import { BannerlordModuleManager } from '@butr/blmodulemanagernative';
import { SUBMOD_FILE, MODULES } from '../common';

export const installSubModules = toBluebird(async (files: string[], destinationPath: string) : Promise<IInstallResult> => {
  const bmm = await BannerlordModuleManager.createAsync();

  // Remove directories straight away.
  const filtered = files.filter((file) => {
    const segments = file.split(path.sep);
    return path.extname(segments[segments.length - 1]) !== ``;
  });
  const subModIds = Array<string>();
  const subMods = filtered.filter((file) => path.basename(file).toLowerCase() === SUBMOD_FILE);

  const moduleInstructions = await Promise.all(subMods.map(async (modFile) => {
    const segments1 = modFile.split(path.sep).filter((seg) => !!seg);
    const xmlData = await fs.readFileAsync(path.join(destinationPath, modFile), { encoding: `utf-8` });
    const subModule = bmm.getModuleInfo(xmlData);
    const subModuleId = subModule?.id || ``;
    const modName = (segments1.length > 1) ? segments1[segments1.length - 2] : subModuleId;
    if (modName === undefined) {
      throw new util.DataInvalid(`Invalid Submodule.xml file - inform the mod author`);
    }
    subModIds.push(subModuleId);
    const idx = modFile.toLowerCase().indexOf(SUBMOD_FILE);
    // Filter the mod files for this specific submodule.
    const subModFiles = filtered.filter((file2) => file2.slice(0, idx) === modFile.slice(0, idx));
    const subModinstructions = subModFiles.map<IInstruction>((modFile1: string) => ({
      type: `copy`,
      source: modFile1,
      destination: path.join(MODULES, modName, modFile1.slice(idx)),
    }));
    // Merge the instruction arrays.
    return subModinstructions;
  }));

  if (subModIds.length > 0) {
    // Push the attribute in for merging of instructions.
    moduleInstructions.push([{
      type: `attribute`,
      key: `subModsIds`,
      value: subModIds,
    }]);
  }
  const instructions = moduleInstructions.flat(1);
  return { instructions };
});

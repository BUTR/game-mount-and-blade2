import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';
import turbowalk, { IEntry, IWalkOptions } from 'turbowalk';
import { fs, selectors, types, util } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { GAME_ID } from '../common';

interface IWalkOptionsWithFilter extends IWalkOptions {
    filter?: (entry: IEntry) => boolean;
  }
  export const walkPath = async (dirPath: string, walkOptions?: IWalkOptionsWithFilter): Promise<IEntry[]> => {
    walkOptions = walkOptions || { skipLinks: true, skipHidden: true, skipInaccessible: true };
    const walkResults: IEntry[] = [];
    return new Promise<IEntry[]>(async (resolve, reject) => {
      await turbowalk(dirPath, (entries: IEntry[]) => {
        const filtered = (walkOptions?.filter === undefined)
          ? entries
          : entries.filter(walkOptions.filter);
        walkResults.push(...filtered);
        return Promise.resolve() as any;
        // If the directory is missing when we try to walk it; it's most probably down to a collection being
        //  in the process of being installed/removed. We can safely ignore this.
      }, walkOptions).catch((err: any) => err.code === 'ENOENT' ? Promise.resolve() : Promise.reject(err));
      return resolve(walkResults);
    });
  }

export const resolveModuleId = async (subModulePath: string): Promise<string | undefined> => {
    try {
      await fs.statAsync(subModulePath);
      const contents = await fs.readFileAsync(subModulePath, 'utf8');
      const data = await parseStringPromise(contents, { explicitArray: false, mergeAttrs: true });
      return data.Module.Id.value;
    } catch {
      return undefined;
    }
  }
  
  type ModuleIdMap = { [moduleId: string]: string };
  const _moduleIdMap: ModuleIdMap = {};
  
  export const resolveModId = async (api: types.IExtensionApi, module: vetypes.ModuleViewModel|string): Promise<string|undefined> => {
    const state = api.getState();
    const moduleId = typeof module === 'object' ? module.moduleInfoExtended?.id : module;
    if (moduleId === undefined) {
      return Promise.reject(new util.DataInvalid(`Module ID is undefined!`));
    }
    if (_moduleIdMap[moduleId] !== undefined) {
      return _moduleIdMap[moduleId];
    }
    const installationPath = selectors.installPathForGame(state, GAME_ID);
    const mods: { [modId: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
    for (const [id, mod] of Object.entries(mods)) {
      const modPath = path.join(installationPath, mod.installationPath);
      const submodules = await walkPath(modPath,
        { filter: (entry: IEntry) => path.basename(entry.filePath).toLowerCase() === 'submodule.xml' });
      for (const submodule of submodules) {
        const subModuleId = await resolveModuleId(submodule.filePath);
        if (subModuleId === moduleId) {
          _moduleIdMap[moduleId] = id;
          return id;
        }
      }
    }
  
    return undefined;
  }
  
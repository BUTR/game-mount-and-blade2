import Promise from 'bluebird';
import * as path from 'path';
import { fs, log, selectors, util } from "vortex-api";
import { IExtensionContext, IMod, IProfile, IProfileMod } from 'vortex-api/lib/types/api';
import { parseXmlString, Document } from 'libxmljs';

import ConstantStorage from './constants';
import { LauncherData, ModuleDataCache, ModuleData } from './types';
import { ILoadOrder, ILoadOrderDisplayItem } from 'vortex-api/lib/extensions/mod_load_order/types/types';


export const CACHE = new ModuleDataCache();
export const LAUNCHER_DATA = {
  singlePlayerSubMods: [] as ModuleData[],
  multiplayerSubMods: [] as ModuleData[],
} as LauncherData


const constants = new ConstantStorage();
const { GAME_ID, OFFICIAL_MODULES, SUBMOD_FILE, XML_EL_MULTIPLAYER } = constants;

const LOCKED_MODULES = new Set([] as string[]);

export { Document, Node } from 'libxmljs';

export async function preSort(context: IExtensionContext, items: ILoadOrderDisplayItem[], direction: 'ascending' | 'descending') {
  const state = context.api.store.getState();
  const activeProfile = selectors.activeProfile(state);
  if (activeProfile?.id === undefined || activeProfile?.gameId !== GAME_ID) {
    // Race condition ?
    return items;
  }

  const modIds = Array.from(CACHE.keys());

  // Locked ids are always at the top of the list as all
  //  other modules depend on these.
  let lockedIds = modIds.filter(id => CACHE.get(id).isLocked);

  try {
    // Sort the locked ids amongst themselves to ensure
    //  that the game receives these in the right order.
    lockedIds = tSort(lockedIds, true);
  } catch (err) {
    return Promise.reject(err);
  }

  // Create the locked entries.
  const lockedItems: ILoadOrderDisplayItem[] = lockedIds.map(id => ({
    id: CACHE.get(id).vortexId,
    name: CACHE.get(id).subModName,
    imgUrl: `${__dirname}/gameart.jpg`,
    locked: true,
    official: OFFICIAL_MODULES.has(id),
  }));
  
  // External ids will include official modules as well but not locked entries.
  const externalIds = modIds.filter(id => (!CACHE.get(id).isLocked) && (CACHE.get(id).vortexId === id));
  const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', activeProfile.id], {}) as ILoadOrder;
  const LOkeys = ((Object.keys(loadOrder).length > 0)
    ? Object.keys(loadOrder)
    : LAUNCHER_DATA.singlePlayerSubMods.map(mod => mod.subModId));

  // External modules that are already in the load order.
  const knownExt = externalIds.filter(id => LOkeys.includes(id)) || [];

  // External modules which are new and have yet to be added to the LO.
  const unknownExt = externalIds.filter(id => !LOkeys.includes(id)) || [];

  items = items.filter(item => {
    // Remove any lockedIds, but also ensure that the
    //  entry can be found in the cache. If it's not in the
    //  cache, this may mean that the submod xml file failed
    //  parse-ing and therefore should not be displayed.
    const isLocked = lockedIds.includes(item.id);
    const hasCacheEntry = Array.from(CACHE.keys()).find(key =>
      CACHE.get(key).vortexId === item.id) !== undefined;
    return !isLocked && hasCacheEntry;
  });

  const posMap = {} as { [x: string]: number; };
  let nextAvailable = LOkeys.length;
  const getNextPos = (loId: string) => {
    if (LOCKED_MODULES.has(loId)) {
      return Array.from(LOCKED_MODULES).indexOf(loId);
    }

    if (posMap[loId] === undefined) {
      posMap[loId] = nextAvailable;
      return nextAvailable++;
    } else {
      return posMap[loId];
    }
  }

  knownExt.map(key => ({
    id: CACHE.get(key).vortexId,
    name: CACHE.get(key).subModName,
    imgUrl: `${__dirname}/gameart.jpg`,
    external: true,
    official: OFFICIAL_MODULES.has(key),
  } as ILoadOrderDisplayItem))
    .sort((a, b) => (loadOrder[a.id]?.pos || getNextPos(a.id)) - (loadOrder[b.id]?.pos || getNextPos(b.id)))
    .forEach(known => {
      // If this a known external module and is NOT in the item list already
      //  we need to re-insert in the correct index as all known external modules
      //  at this point are actually deployed inside the mods folder and should
      //  be in the items list!
      const diff = (LOkeys.length) - (LOkeys.length - Array.from(LOCKED_MODULES).length);
      if (items.find(item => item.id === known.id) === undefined) {
        const pos = loadOrder[known.id]?.pos;
        const idx = (pos !== undefined) ? (pos - diff) : (getNextPos(known.id) - diff);
        items.splice(idx, 0, known);
        //items = [].concat(items.slice(0, idx) || [], known, items.slice(idx) || []);
      }
    });

  const unknownItems = ([] as string[]).concat(unknownExt)
    .map(key => ({
      id: CACHE.get(key).vortexId,
      name: CACHE.get(key).subModName,
      imgUrl: `${__dirname}/gameart.jpg`,
      external: unknownExt.includes(key),
      official: OFFICIAL_MODULES.has(key),
    } as ILoadOrderDisplayItem));

  const preSorted = ([] as ILoadOrderDisplayItem[]).concat(lockedItems, items, unknownItems);
  return (direction === 'descending')
    ? Promise.resolve(preSorted.reverse())
    : Promise.resolve(preSorted);
}

export async function walkAsync(dir: string , levelsDeep: number = 2): Promise<string[]> {
  let entries: string[] = [];
  return fs.readdirAsync(dir).then((files: string[]) => {
    const filtered = files.filter(file => !file.endsWith('.vortex_backup'));
    return Promise.each(filtered, (file: string) => {
      const fullPath = path.join(dir, file);
      return fs.statAsync(fullPath).then((stats: fs.Stats) => {
        if (stats.isDirectory() && levelsDeep > 0)
        {
          return walkAsync(fullPath, levelsDeep - 1)
            .then((nestedFiles: string[])=> {
              entries = entries.concat(nestedFiles);
              return Promise.resolve();
            })
        } else {
          entries.push(fullPath);
          return Promise.resolve();
        }
      }).catch(err => {
        // This is a valid use case, particularly if the file
        //  is deployed by Vortex using symlinks, and the mod does
        //  not exist within the staging folder.
        log('error', 'MnB2: invalid symlink', err);
        return (err.code === 'ENOENT')
          ? Promise.resolve()
          : Promise.reject(err);
      });
    });
  })
  .then(() => Promise.resolve(entries))
}

export async function getElementValue(subModuleFilePath: string, elementName: string): Promise<string> {
  const logAndContinue: Promise = () => {
    log('error', 'Unable to parse xml element', elementName);
    return Promise.resolve(undefined);
  }
  return fs.readFileAsync(subModuleFilePath, { encoding: 'utf-8' })
    .then((xmlData: string) => {
      try {
        const modInfo = parseXmlString(xmlData);
        const element = modInfo.get(`//${elementName}`);
        return ((element !== undefined) && (element.attr('value').value() !== undefined))
          ? Promise.resolve(element.attr('value').value())
          : logAndContinue();
      } catch (err) {
        const errorMessage = `Vortex was unable to parse: ${subModuleFilePath}; please inform the mod author`; 
        return Promise.reject(new util.DataInvalid(errorMessage));
      }
    });
}

export async function getXMLData(xmlFilePath: string): Promise<Document> {
  return fs.readFileAsync(xmlFilePath)
    .then((data: string) => {
      try {
        const xmlData = parseXmlString(data);
        return Promise.resolve(xmlData);
      } catch (err) {
        return Promise.reject(new util.DataInvalid(err.message));
      }
    })
    .catch(err => (err.code === 'ENOENT')
      ? Promise.reject(new util.NotFound(xmlFilePath))
      : Promise.reject(new util.DataInvalid(err.message)));
}

async function getManagedIds(context: IExtensionContext) {
  const state = context.api.store.getState();
  const activeProfile = selectors.activeProfile(state);
  if (activeProfile === undefined) {
    // This is a valid use case if the gamemode
    //  has failed activation.
    return Promise.resolve([]);
  }

  const modState = util.getSafe(state, ['persistent', 'profiles', activeProfile.id, 'modState'], {} as { [id: string]: IProfileMod; });
  const mods = util.getSafe(state, ['persistent', 'mods', GAME_ID], {} as { [id: string]: IMod; });
  const enabledMods = Object.keys(modState)
    .filter(key => !!mods[key] && modState[key].enabled)
    .map(key => mods[key]);

  const invalidMods = [] as string[];
  const installationDir: string = selectors.installPathForGame(state, GAME_ID);
  if (installationDir === undefined) {
    log('error', 'failed to get managed ids', 'undefined staging folder');
    return Promise.resolve([] as string[]);
  }
  return Promise.reduce(enabledMods, async (accum: ModuleData[], entry: IMod) => {
    if (entry?.installationPath === undefined) {
      // Invalid mod entry - skip it.
      return Promise.resolve(accum);
    }
    const modInstallationPath = path.join(installationDir, entry.installationPath);
    let files: string[];
    try {
      files = await walkAsync(modInstallationPath, 3);
    } catch (err) {
      // The mod must've been removed manually by the user from
      //  the staging folder - good job buddy!
      //  Going to log this, but otherwise allow it to proceed.
      invalidMods.push(entry.id);
      log('error', 'failed to read mod staging folder', { modId: entry.id, error: err.message });
      return Promise.resolve(accum);
    }

    const subModFile = files.find(file => path.basename(file).toLowerCase() === SUBMOD_FILE)
    if (subModFile === undefined) {
      // No submod file - no LO
      return Promise.resolve(accum);
    }

    let subModId: string;
    try {
      subModId = await getElementValue(subModFile, 'Id');
    } catch (err) {
      // The submodule would've never managed to install correctly
      //  if the xml file had been invalid - this suggests that the user
      //  or a 3rd party application has tampered with the file...
      //  We simply log this here as the parse-ing failure will be highlighted
      //  by the CACHE logic.
      log('error', '[MnB2] Unable to parse submodule file', err);
      //context.api.showErrorNotification('Unable to parse submodule file', err);
      return Promise.resolve(accum);
    }
    
    accum.push({
      subModId,
      subModFile,
      vortexId: entry.id,
    });

    return Promise.resolve(accum)
  }, [] as ModuleData[])
  .tap((res) => {
    if (invalidMods.length > 0) {
      const errMessage = 'The following mods are inaccessible or are missing '
        + 'in the staging folder:\n\n' + invalidMods.join('\n') + '\n\nPlease ensure '
        + 'these mods and their content are not open in any other application '
        + '(including the game itself). If the mod is missing entirely, please re-install it '
        + 'or remove it from your mods page. Please check your vortex log file for details.';
      context.api.showErrorNotification('Invalid Mods in Staging',
                                        new Error(errMessage), { allowReport: false });
    }
    return Promise.resolve(res);
  });
}

export async function getDeployedModData(context: IExtensionContext, subModuleFilePaths: string[]): Promise<ModuleDataCache> {
  const managedIds = await getManagedIds(context);
  return Promise.reduce(subModuleFilePaths, async (accum: ModuleDataCache, subModFile: string) => {
    try {
      const subModData: Document = await getXMLData(subModFile);
      const subModId = subModData.get('//Id').attr('value').value();
      const managedEntry: ModuleData = managedIds.find((entry: ModuleData) => entry.subModId === subModId);
      const isMultiplayer = (!!subModData.get(`//${XML_EL_MULTIPLAYER}`));
      const depNodes = subModData.find('//DependedModule');
      let dependencies = [] as string[];
      try {
        dependencies = depNodes.map(depNode => depNode.attr('Id').value());
      } catch (err) {
        log('debug', 'submodule has no dependencies or is invalid', err);
      }
      const subModName = subModData.get('//Name').attr('value').value();

      accum[subModId] = {
        subModId,
        subModName,
        subModFile,
        vortexId: !!managedEntry ? managedEntry.vortexId : subModId,
        isOfficial: OFFICIAL_MODULES.has(subModId),
        isLocked: LOCKED_MODULES.has(subModId),
        isMultiplayer,
        dependencies,
        invalid: {
          cyclic: [] as string[], // Will hold the submod ids of any detected cyclic dependencies.
          missing: [] as string[], // Will hold the submod ids of any missing dependencies.
        },
      };
    } catch(err) {
      const errorMessage = 'Vortex was unable to parse: ' + subModFile + ';\n\n'
                         + 'You can either inform the mod author and wait for fix, or '
                         + 'you can use an online xml validator to find and fix the error yourself.';
      // libxmljs rarely produces useful error messages - it usually points
      //  to the parent node of the actual problem and in this case nearly
      //  always will point to the root of the XML file (Module) which is completely useless.
      //  We're going to provide a human readable error to the user.
      context.api.showErrorNotification('Unable to parse submodule file', errorMessage, { allowReport: false });
      log('error', 'MNB2: parsing error', err);
    }
    
    return Promise.resolve(accum);
  }, new ModuleDataCache());
}

function isInvalid(subModId: string) {
  const cyclicErrors = util.getSafe(CACHE.get(subModId), ['invalid', 'cyclic'], [] as string[]);
  const missingDeps = util.getSafe(CACHE.get(subModId), ['invalid', 'missing'], [] as string[]);
  return ((cyclicErrors.length > 0) || (missingDeps.length > 0));
}

export function tSort(subModIds: string[], allowLocked: boolean = false, loadOrder: ILoadOrder = undefined): string[] {
  // Topological sort - we need to:
  //  - Identify cyclic dependencies.
  //  - Identify missing dependencies.

  // These are manually locked mod entries.
  const lockedSubMods = (!!loadOrder)
    ? subModIds.filter(subModId => {
      const entry = CACHE.get(subModId);
      return (!!entry)
        ? !!loadOrder[entry.vortexId]?.locked
        : false;
    })
    : [];
  const alphabetical = subModIds.filter(subMod => !lockedSubMods.includes(subMod))
                                .sort();
  const graph = alphabetical.reduce((accum: { [x: string]: string[]; }, entry) => {
    // Create the node graph.
    accum[entry] = CACHE.get(entry).dependencies.sort();
    return accum;
  }, {});

  // Will store the final LO result
  const result = [] as string[];
  
  // The nodes we have visited/processed.
  let visited = [];

  // The nodes which are still processing.
  let processing = [];

  const topSort = (node: string) => {
    processing[node] = true;
    const dependencies = (!!allowLocked)
      ? graph[node]
      : graph[node].filter(element => !LOCKED_MODULES.has(element));

    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i];
      if (processing[dep]) {
        // Cyclic dependency detected - highlight both mods as invalid
        //  within the cache itself - we also need to highlight which mods.
        CACHE.get(node).invalid.cyclic.push(dep);
        CACHE.get(dep).invalid.cyclic.push(node);

        visited[node] = true;
        processing[node] = false;
        continue;
      }

      if (!visited[dep]) {
        if (!Object.keys(graph).includes(dep)) {
          CACHE.get(node).invalid.missing.push(dep);
        } else {
          topSort(dep);
        }
      }
    };

    processing[node] = false;
    visited[node] = true;

    if (!isInvalid(node)) {
      result.push(node);
    }
  }
  
  for (const node in graph) {
    if (!visited[node] && !processing[node]) {
      topSort(node);
    }
  }

  // Proper topological sort dictates we simply return the
  //  result at this point. But, mod authors want modules
  //  with no dependencies to bubble up to the top of the LO.
  //  (This will only apply to non locked entries)
  if (allowLocked) {
    return result;
  }

  const subModsWithNoDeps = result.filter(dep => (graph[dep].length === 0)
    || (graph[dep].find(d => !LOCKED_MODULES.has(d)) === undefined)).sort() || [];
  let tamperedResult = [].concat(subModsWithNoDeps, result.filter(entry => !subModsWithNoDeps.includes(entry)));
  lockedSubMods.forEach(subModId => {
    const pos = loadOrder[CACHE.get(subModId).vortexId].pos;
    tamperedResult.splice(pos, 0, [subModId]);
  });
  return tamperedResult;
}
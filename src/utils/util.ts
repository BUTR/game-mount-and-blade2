import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import {
  actions, fs, log, selectors, types, util,
} from 'vortex-api';
import { IDiscoveryResult } from 'vortex-api/lib/types/IState';
import { parseStringPromise } from 'xml2js';

import { BANNERLORD_EXEC, GAME_ID } from '../common';
import { getCache } from './subModCache';
import { ILoadOrder, IMods, IProps } from '../types';

// Used for the "custom launcher" tools.
//  gameMode: singleplayer or multiplayer
//  subModIds: the mod ids we want to load into the game.
const PARAMS_TEMPLATE = [`/{{gameMode}}`, `_MODULES_{{subModIds}}*_MODULES_`];

export const getXMLData = async (xmlFilePath: string): Promise<any> => {
  try {
    const data = fs.readFileAsync(xmlFilePath);
    return parseStringPromise(data);
  } catch (err: any) {
    throw (err.code === `ENOENT`) ? new util.NotFound(xmlFilePath) : new util.DataInvalid(err.message);
  }
};

export const genProps = (api: types.IExtensionApi, profileId?: string): IProps | undefined => {
  const state = api.getState();
  const profile = (profileId !== undefined) ? selectors.profileById(state, profileId) : selectors.activeProfile(state);

  if (profile?.gameId !== GAME_ID) {
    return undefined;
  }

  const discovery = util.getSafe<IDiscoveryResult | undefined>(state, [`settings`, `gameMode`, `discovered`, GAME_ID], undefined);
  if (discovery?.path === undefined) {
    return undefined;
  }

  const mods = util.getSafe<IMods>(state, [`persistent`, `mods`, GAME_ID], {});

  const enabledMods = Object.keys(mods)
    .filter((id) => util.getSafe<boolean>(profile, [`modState`, id, `enabled`], false))
    .reduce((accum: IMods, id) => {
      accum[id] = mods[id];
      return accum;
    }, {});

  return {
    state,
    profile,
    discovery,
    enabledMods,
  };
};

export const refreshGameParams = async (context: types.IExtensionContext, loadOrder: ILoadOrder): Promise<void> => {
  // Go through the enabled entries so we can form our game parameters.
  const enabled = (!!loadOrder && Object.keys(loadOrder).length > 0)
    ? Object.keys(loadOrder)
      .filter((key) => loadOrder[key].enabled)
      .sort((lhs, rhs) => loadOrder[lhs].pos - loadOrder[rhs].pos)
      .reduce((accum, key) => {
        const CACHE = getCache();
        const cacheKeys = Object.keys(CACHE);
        const entry = cacheKeys.find((cacheElement) => CACHE[cacheElement].vortexId === key);
        if (entry) {
          accum.push(entry);
        }
        return accum;
      }, Array<string>())
    : Array<string>();

  // Currently Singleplayer only! (more research into MP needs to be done)
  const parameters = [
    PARAMS_TEMPLATE[0].replace(`{{gameMode}}`, `singleplayer`),
    PARAMS_TEMPLATE[1].replace(`{{subModIds}}`, enabled.map((key) => `*${key}`).join(``)),
  ];

  // This launcher will not function unless the path is guaranteed to point
  //  towards the bannerlord executable. Given that earlier versions of this
  //  extension had targeted TaleWorlds.Launcher.exe instead - we need to make
  //  sure this is set correctly.
  context.api.store?.dispatch(actions.setGameParameters(GAME_ID, {
    executable: BANNERLORD_EXEC,
    parameters,
  }));
};

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

import path from 'path';
import { fs, selectors, types } from 'vortex-api';
import { GAME_ID, LOAD_ORDER_SUFFIX } from '../../common';
import { PersistenceLoadOrderStorage } from '../../types';
import { filterEntryWithInvalidId } from '../util';

const getLoadOrderFileName = (profileId: string): string => {
  return `${profileId}${LOAD_ORDER_SUFFIX}`;
};

const getLoadOrderFilePath = (api: types.IExtensionApi, loadOrderFileName: string): string => {
  return path.join(selectors.installPathForGame(api.getState(), GAME_ID), loadOrderFileName);
};

/**
 * We need to keep it sync while the LauncherManager doesn't support async
 * @param api
 * @returns
 */
export const readLoadOrder = (api: types.IExtensionApi): PersistenceLoadOrderStorage => {
  try {
    const profile = selectors.activeProfile(api.getState());
    const loFileName = getLoadOrderFileName(profile.id);
    const loFilePath = getLoadOrderFilePath(api, loFileName);
    const fileContents = fs.readFileSync(loFilePath, 'utf8');

    const loadOrder: PersistenceLoadOrderStorage = JSON.parse(fileContents);
    return loadOrder.filter((x) => !!x && filterEntryWithInvalidId(x));
  } catch {
    return [];
  }
};

/**
 * We need to keep it sync while the LauncherManager doesn't support async
 * @param api
 * @returns
 */
export const writeLoadOrder = (api: types.IExtensionApi, loadOrder: PersistenceLoadOrderStorage): void => {
  try {
    const profile = selectors.activeProfile(api.getState());
    const loFileName = getLoadOrderFileName(profile.id);
    const loFilePath = getLoadOrderFilePath(api, loFileName);
    //await fs.ensureDirWritableS(path.dirname(loFilePath));
    fs.writeFileSync(loFilePath, JSON.stringify(Object.values(loadOrder), null, 2), { encoding: 'utf8' });
  } catch {
    /* empty */
  }
};

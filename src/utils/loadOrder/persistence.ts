import path from 'path';
import { fs, selectors, types } from 'vortex-api';
import { GAME_ID, LOAD_ORDER_SUFFIX } from '../../common';
import { PersistenceLoadOrderStorage } from '../../types';

const getLoadOrderFileName = (api: types.IExtensionApi): string => {
  const profileId = selectors.activeProfile(api.getState()).id;
  return `${profileId}${LOAD_ORDER_SUFFIX}`;
};

const getLoadOrderFilePath = (api: types.IExtensionApi): string => {
  const loadOrderFileName = getLoadOrderFileName(api);
  return path.join(selectors.installPathForGame(api.getState(), GAME_ID), loadOrderFileName);
};

/**
 * We need to keep it sync while the LauncherManager doesn't support async
 * @param api
 * @returns
 */
export const readLoadOrder = (api: types.IExtensionApi): PersistenceLoadOrderStorage => {
  try {
    const loFilePath = getLoadOrderFilePath(api);
    const fileContents = fs.readFileSync(loFilePath, 'utf8');
    return JSON.parse(fileContents);
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
    const loFilePath = getLoadOrderFilePath(api);
    //await fs.ensureDirWritableS(path.dirname(loFilePath));
    fs.writeFileSync(loFilePath, JSON.stringify(Object.values(loadOrder), null, 2), { encoding: 'utf8' });
  } catch {
    /* empty */
  }
};

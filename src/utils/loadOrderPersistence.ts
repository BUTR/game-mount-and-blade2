import { fs, types } from 'vortex-api';
import { getLoadOrderFilePath } from './util';
import { PersistenceLoadOrderStorage } from '../types';

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
}

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
    
  }
}
import { fs, types, util } from 'vortex-api';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from '../common';

export const getPathExistsAsync = (path: string): Promise<boolean> => {
  return fs
    .statAsync(path)
    .then(() => true)
    .catch(() => false);
};

export const findGame = (): Promise<types.IGameStoreEntry> => {
  return util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]);
};

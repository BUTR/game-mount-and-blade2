import { fs, types, util } from 'vortex-api';
import { EPICAPP_ID, GOG_IDS, STEAMAPP_ID, XBOX_ID } from '../common';

export const getPathExistsAsync = async (path: string): Promise<boolean> => {
  return fs
    .statAsync(path)
    .then(() => true)
    .catch(() => false);
};

export const findGame = async (): Promise<types.IGameStoreEntry> => {
  return util.GameStoreHelper.findByAppId([EPICAPP_ID, STEAMAPP_ID.toString(), ...GOG_IDS, XBOX_ID]);
};

type HasId = {
  id: string;
};
const hasId = (persistent: HasId): persistent is HasId => {
  return !!persistent.id && persistent.id !== '';
};

export const filterEntryWithInvalidId = (entry: HasId): boolean => {
  return hasId(entry);
};

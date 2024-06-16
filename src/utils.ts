import { fs } from 'vortex-api';

export const getPathExistsAsync = async (path: string): Promise<boolean> => {
  return await fs
    .statAsync(path)
    .then(() => true)
    .catch(() => false);
};

export const filterEntryWithInvalidId = (entry: { id: string }): boolean => {
  return entry.id !== undefined && entry.id !== '';
};

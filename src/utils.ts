import { stat } from "node:fs/promises";

export const getPathExistsAsync = async (path: string): Promise<boolean> => {
  return await stat(path)
    .then(() => true)
    .catch(() => false);
};

export const isFileNotFoundError = (err: unknown): boolean =>
  err instanceof Error && "code" in err && err.code === "ENOENT";

export const filterEntryWithInvalidId = (entry: { id: string }): boolean => {
  return entry.id !== undefined && entry.id !== "";
};

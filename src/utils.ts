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

export function nameof<TObject>(obj: TObject, key: keyof TObject): string;
export function nameof<TObject>(key: keyof TObject): string;
export function nameof(key1: unknown, key2?: unknown): unknown {
  return key2 ?? key1;
}

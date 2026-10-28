import { promises as fs } from "fs";

const isNotFoundError = (err: unknown): boolean =>
  err instanceof Error &&
  "code" in err &&
  (err.code === "ENOENT" || err.code === "ENOTDIR");

export const getPathExistsAsync = (filePath: string): Promise<boolean> =>
  fs.access(filePath).then(
    () => true,
    () => false,
  );

/**
 * The file's contents, undefined when it doesn't exist. Other failures, like a file that can't be read, throw
 */
export const readFileIfExistsAsync = async (
  filePath: string,
): Promise<Buffer | undefined> => {
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    if (isNotFoundError(err)) {
      return undefined;
    }
    throw err;
  }
};

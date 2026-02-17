import { types } from "vortex-api";
import { allocWithoutOwnership } from "@butr/vortexextensionnative";
import path from "path";
import { FileHandle, open, readdir, rm, writeFile } from "node:fs/promises";
import { LocalizationManager } from "../../localization";
import { isFileNotFoundError } from "../../utils";

/**
 * Callback: reads file content at a given path
 */
export const readFileContentCallback =
  (api: types.IExtensionApi) =>
  async (
    filePath: string,
    offset: number,
    length: number,
  ): Promise<Uint8Array | null> => {
    try {
      let fileHandle: FileHandle | null = null;
      try {
        fileHandle = await open(filePath, "r");
        if (length === -1) {
          const stats = await fileHandle.stat();
          length = stats.size;
        }
        const buffer = allocWithoutOwnership(length) ?? new Uint8Array(length);
        await fileHandle.read(buffer, 0, length, offset);
        return buffer;
      } finally {
        await fileHandle?.close();
      }
    } catch (err) {
      if (isFileNotFoundError(err)) {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Error reading file content"), err);
    }
    return null;
  };

/**
 * Callback: writes file content or deletes a file
 */
export const writeFileContentCallback =
  (api: types.IExtensionApi) =>
  async (filePath: string, data: Uint8Array): Promise<void> => {
    try {
      if (data === null) {
        await rm(filePath);
      } else {
        await writeFile(filePath, data);
      }
    } catch (err) {
      if (isFileNotFoundError(err)) {
        return;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Error writing file content"), err);
    }
  };

const readDirectoryEntriesCallback =
  (
    api: types.IExtensionApi,
    filter: (entry: { isFile(): boolean; isDirectory(): boolean }) => boolean,
    errorMessage: string,
  ) =>
  async (directoryPath: string): Promise<string[] | null> => {
    try {
      const dirs = await readdir(directoryPath, { withFileTypes: true });
      const res = dirs
        .filter(filter)
        .map<string>((x) => path.join(directoryPath, x.name));
      return res;
    } catch (err) {
      if (isFileNotFoundError(err)) {
        return null;
      }
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t(errorMessage), err);
    }
    return null;
  };

/**
 * Callback: lists files in a directory
 */
export const readDirectoryFileListCallback = (api: types.IExtensionApi) =>
  readDirectoryEntriesCallback(
    api,
    (x) => x.isFile(),
    "Error reading directory file list",
  );

/**
 * Callback: lists subdirectories in a directory
 */
export const readDirectoryListCallback = (api: types.IExtensionApi) =>
  readDirectoryEntriesCallback(
    api,
    (x) => x.isDirectory(),
    "Error reading directory list",
  );

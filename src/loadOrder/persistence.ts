import { selectors, types } from "vortex-api";
import path from "path";
import { readFile, writeFile } from "node:fs/promises";
import { GAME_ID, LOAD_ORDER_SUFFIX } from "../common";
import { PersistenceLoadOrderStorage } from "../types";
import { filterEntryWithInvalidId, isFileNotFoundError } from "../utils";
import { LocalizationManager } from "../localization";

const getLoadOrderFileName = (profileId: string): string => {
  return `${profileId}${LOAD_ORDER_SUFFIX}`;
};

const getLoadOrderFilePath = (
  api: types.IExtensionApi,
  loadOrderFileName: string,
): string => {
  return path.join(
    selectors.installPathForGame(api.getState(), GAME_ID),
    loadOrderFileName,
  );
};

/**
 * We need to keep it sync while the LauncherManager doesn't support async
 * @param api
 * @returns
 */
export const readLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<PersistenceLoadOrderStorage> => {
  try {
    const profile = selectors.activeProfile(api.getState());
    if (!profile) {
      throw new Error(`Active profile is undefined`);
    }
    const loFileName = getLoadOrderFileName(profile.id);
    const loFilePath = getLoadOrderFilePath(api, loFileName);
    const fileContents = await readFile(loFilePath, "utf8");

    // Trim the file contents to remove any trailing whitespace or extra content
    const trimmedContents = fileContents.trim();

    // Try to find the end of the JSON array if there's extra content
    let jsonString = trimmedContents;
    if (trimmedContents.startsWith("[")) {
      const lastBracketIndex = trimmedContents.lastIndexOf("]");
      if (lastBracketIndex !== -1) {
        jsonString = trimmedContents.substring(0, lastBracketIndex + 1);
      }
    }

    const loadOrder: PersistenceLoadOrderStorage = JSON.parse(jsonString);
    return loadOrder.filter(
      (x) => x !== undefined && filterEntryWithInvalidId(x),
    );
  } catch (err) {
    if (isFileNotFoundError(err)) {
      return [];
    }
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to read load order"), err);
    return [];
  }
};

/**
 * We need to keep it sync while the LauncherManager doesn't support async
 * @param api
 * @returns
 */
export const writeLoadOrderAsync = async (
  api: types.IExtensionApi,
  loadOrder: PersistenceLoadOrderStorage,
): Promise<void> => {
  try {
    const profile = selectors.activeProfile(api.getState());
    if (!profile) {
      throw new Error(`Active profile is undefined`);
    }
    const loFileName = getLoadOrderFileName(profile.id);
    const loFilePath = getLoadOrderFilePath(api, loFileName);
    await writeFile(
      loFilePath,
      JSON.stringify(Object.values(loadOrder), null, 2),
      { encoding: "utf8" },
    );
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to save load order"), err);
  }
};

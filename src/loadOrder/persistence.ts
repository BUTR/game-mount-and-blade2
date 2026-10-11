import { selectors, types } from "vortex-api";
import path from "path";
import { readFile, unlink, writeFile } from "node:fs/promises";
import {
  GAME_ID,
  LOAD_ORDER_SUFFIX,
  MULTIPLAYER_LOAD_ORDER_SUFFIX,
} from "../common";
import { IStateWithBannerlord, PersistenceLoadOrderStorage } from "../types";
import { bselectors } from "../selectors";
import { GameMode } from "../settings/types";
import { filterEntryWithInvalidId, isFileNotFoundError } from "../utils";
import { LocalizationManager } from "../localization/manager";

/**
 * Each game mode keeps its own load order. Singleplayer keeps the file name it always had
 */
const getLoadOrderFileName = (profileId: string, gameMode: GameMode): string =>
  gameMode === "multiplayer"
    ? `${profileId}${MULTIPLAYER_LOAD_ORDER_SUFFIX}`
    : `${profileId}${LOAD_ORDER_SUFFIX}`;

const getLoadOrderFilePath = (
  api: types.IExtensionApi,
  loadOrderFileName: string,
): string => {
  const installPath = selectors.installPathForGame(api.getState(), GAME_ID);
  return path.join(installPath ?? "", loadOrderFileName);
};

const getActiveProfileMode = (
  api: types.IExtensionApi,
): { profileId: string; gameMode: GameMode } => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  if (!profile) {
    throw new Error(`Active profile is undefined`);
  }
  return {
    profileId: profile.id,
    gameMode: bselectors.gameModeForProfile(state, profile.id),
  };
};

/**
 * Deletes the saved load order files for a removed profile.
 * (By default, Vortex only removes files inside the profile's directory.)
 */
export const removeProfileLoadOrdersAsync = async (
  api: types.IExtensionApi,
  profileId: string,
): Promise<void> => {
  const installPath = selectors.installPathForGame(api.getState(), GAME_ID);
  if (!installPath) {
    return;
  }
  const gameModes: GameMode[] = ["singleplayer", "multiplayer"];
  await Promise.all(
    gameModes.map((gameMode) =>
      unlink(
        path.join(installPath, getLoadOrderFileName(profileId, gameMode)),
      ).catch(() => undefined),
    ),
  );
};

/**
 * Reads the load order stored for a profile and game mode, regardless of whether the profile is currently active.
 * A missing file is an empty load order, any other failure throws, so callers that write the result back don't
 * replace a load order they couldn't read
 */
export const readProfileLoadOrderOrThrowAsync = async (
  api: types.IExtensionApi,
  profileId: string,
  gameMode: GameMode,
): Promise<PersistenceLoadOrderStorage> => {
  const loFilePath = getLoadOrderFilePath(
    api,
    getLoadOrderFileName(profileId, gameMode),
  );
  let fileContents: string;
  try {
    fileContents = await readFile(loFilePath, "utf8");
  } catch (err) {
    if (isFileNotFoundError(err)) {
      return [];
    }
    throw err;
  }

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
};

/**
 * Reads the load order stored for a profile and game mode, regardless of whether the profile is currently active.
 * A load order that can't be read is reported and read as empty
 */
export const readProfileLoadOrderAsync = async (
  api: types.IExtensionApi,
  profileId: string,
  gameMode: GameMode,
): Promise<PersistenceLoadOrderStorage> => {
  try {
    return await readProfileLoadOrderOrThrowAsync(api, profileId, gameMode);
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to read load order"), err);
    return [];
  }
};

/**
 * Writes the load order a profile keeps for a game mode, whether or not it is active
 */
export const writeProfileLoadOrderAsync = async (
  api: types.IExtensionApi,
  profileId: string,
  gameMode: GameMode,
  loadOrder: PersistenceLoadOrderStorage,
): Promise<void> => {
  try {
    const loFilePath = getLoadOrderFilePath(
      api,
      getLoadOrderFileName(profileId, gameMode),
    );
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

/**
 * Reads the active profile's load order for its game mode
 */
export const readLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<PersistenceLoadOrderStorage> => {
  try {
    const { profileId, gameMode } = getActiveProfileMode(api);
    return await readProfileLoadOrderAsync(api, profileId, gameMode);
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to read load order"), err);
    return [];
  }
};

/**
 * Writes the active profile's load order for its game mode
 */
export const writeLoadOrderAsync = async (
  api: types.IExtensionApi,
  loadOrder: PersistenceLoadOrderStorage,
): Promise<void> => {
  try {
    const { profileId, gameMode } = getActiveProfileMode(api);
    await writeProfileLoadOrderAsync(api, profileId, gameMode, loadOrder);
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to save load order"), err);
  }
};

/**
 * Turns modules on in a profile's load order for a game mode, adding the ones it doesn't list yet at the end.
 * Ordering them is left to the load order, which sorts them when it is read next
 */
export const enableInProfileLoadOrderAsync = async (
  api: types.IExtensionApi,
  profileId: string,
  gameMode: GameMode,
  modules: { id: string; name: string }[],
): Promise<void> => {
  const loadOrder = await readProfileLoadOrderOrThrowAsync(
    api,
    profileId,
    gameMode,
  );
  const updated = loadOrder.map((entry) =>
    modules.some((module) => module.id === entry.id)
      ? { ...entry, isSelected: true }
      : entry,
  );
  for (const module of modules) {
    if (!updated.some((entry) => entry.id === module.id)) {
      updated.push({
        id: module.id,
        name: module.name,
        isSelected: true,
        isDisabled: false,
        index: updated.length,
      });
    }
  }
  await writeProfileLoadOrderAsync(api, profileId, gameMode, updated);
};

import { log, selectors, types, util } from "@nexusmods/vortex-api";
import path from "path";
import { readFile, unlink } from "node:fs/promises";
import {
  GAME_ID,
  LOAD_ORDER_SUFFIX,
  MULTIPLAYER_LOAD_ORDER_SUFFIX,
} from "../common";
import { IStateWithBannerlord, PersistenceLoadOrderStorage } from "../types";
import { bselectors } from "../selectors";
import { GameMode } from "../settings/types";
import { isFileNotFoundError } from "../fsUtils";
import { filterEntryWithInvalidId } from "../utils";
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

/**
 * The write in progress for each load order file.
 * Two overlapping writes to one file both truncate it first, so the end of the longer order could remain after the
 * shorter one: the 'Unexpected non-whitespace character after JSON' error. Writes to a file run one after another,
 * and each replaces the file whole
 */
const pendingWrites = new Map<string, Promise<void>>();

const queueWriteAsync = (filePath: string, contents: string): Promise<void> => {
  const previous = pendingWrites.get(filePath) ?? Promise.resolve();
  // A failed write was reported by its caller and doesn't stop the next one
  const write = previous
    .catch(() => undefined)
    .then(() => util.writeFileAtomic(filePath, contents));
  pendingWrites.set(filePath, write);
  write
    .finally(() => {
      if (pendingWrites.get(filePath) === write) {
        pendingWrites.delete(filePath);
      }
    })
    .catch(() => undefined);
  return write;
};

const getActiveProfileMode = (
  api: types.IExtensionApi,
): { profileId: string; gameMode: GameMode } => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  if (profile?.gameId !== GAME_ID) {
    // While switching profiles or games, Vortex has no active profile for a moment or one of another game
    throw new util.ProcessCanceled(`No active Bannerlord profile`);
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
  // A caller that writes the result back would otherwise undo a write that hasn't finished
  await pendingWrites.get(loFilePath)?.catch(() => undefined);

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
    await queueWriteAsync(
      loFilePath,
      JSON.stringify(Object.values(loadOrder), null, 2),
    );
  } catch (err) {
    const { localize: t } = LocalizationManager.getInstance(api);
    api.showErrorNotification?.(t("Failed to save load order"), err);
  }
};

/**
 * Reads the active profile's load order for its game mode.
 * Without an active profile the read is canceled, an empty order would replace the profile's in Vortex
 */
export const readLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<PersistenceLoadOrderStorage> => {
  const { profileId, gameMode } = getActiveProfileMode(api);
  return await readProfileLoadOrderAsync(api, profileId, gameMode);
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
    if (err instanceof util.ProcessCanceled) {
      log(
        "warn",
        "Skipped writing the load order without an active Bannerlord profile",
      );
      return;
    }
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

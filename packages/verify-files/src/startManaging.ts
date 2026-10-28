import { log, selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { LocalizationManager } from "@bannerlord/core/localization/manager";
import { Localize } from "@bannerlord/core/localization/types";
import { verifyAndKeepAsync } from "./keptReport";
import { showUnexpectedFilesAsync } from "./unexpectedFilesDialog";
import { getStoreName, getVerifyStore, UNEXPECTED_SOURCES } from "./verify";
import { VERIFY_FILES_PAGE_ID } from "./views/options";

type Profiles = Record<string, types.IProfile> | undefined;

const hasGameProfiles = (profiles: Profiles): boolean =>
  Object.values(profiles ?? {}).some((profile) => profile.gameId === GAME_ID);

/**
 * Whether Vortex started managing the game since the game was last activated
 */
let startedManaging = false;

/**
 * Vortex has no event for starting to manage a game. Managing it adds its first profile, activating that profile
 * sets the game up and activates it. Stopping to manage removes its profiles, managing it again adds one
 */
export const watchStartManaging = (api: types.IExtensionApi): void => {
  api.onStateChange?.(["persistent", "profiles"], (previous, current) => {
    if (
      !hasGameProfiles(previous as Profiles) &&
      hasGameProfiles(current as Profiles)
    ) {
      startedManaging = true;
    }
  });
};

export const getStartManagingText = (
  t: Localize,
  count: number,
  store: string,
): string =>
  count === 1
    ? t(
        "1 file doesn't match the {{store}} build and wasn't deployed by Vortex, like a mod copied in by hand or " +
          "a changed game file. Such files often break the game and the mods Vortex installs. Review it on the " +
          "Game files page, where it can be archived or deleted.",
        { store },
      )
    : t(
        "{{count}} files don't match the {{store}} build and weren't deployed by Vortex, like mods copied in by " +
          "hand or changed game files. They often break the game and the mods Vortex installs. Review them on the " +
          "Game files page, where they can be archived or deleted.",
        { count: `${count}`, store },
      );

const warnAboutUnexpectedFilesAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  // The other stores have no list of the build's files
  if (getVerifyStore(api.getState()) === undefined) {
    return;
  }

  // The Game files page shows this report instead of verifying again
  const report = await verifyAndKeepAsync(api);
  const unexpected = report.files.filter((file) =>
    UNEXPECTED_SOURCES.includes(file.source),
  );
  // The page the dialog opens is the game's, another game may have been activated meanwhile
  if (
    unexpected.length === 0 ||
    selectors.activeGameId(api.getState()) !== GAME_ID
  ) {
    return;
  }

  const { localize: t } = LocalizationManager.getInstance(api);
  const action = await showUnexpectedFilesAsync(api, report, unexpected, {
    title: t("The Game Folder Has Unexpected Files"),
    text: getStartManagingText(
      t,
      unexpected.length,
      getStoreName(report.store),
    ),
    actions: [
      { id: "close", label: t("Close") },
      { id: "review", label: t("Review"), primary: true },
    ],
    dismissAction: "close",
  });
  if (action === "review") {
    api.events.emit("show-main-page", VERIFY_FILES_PAGE_ID);
  }
};

/**
 * Verifies the game folder on the game's first activation after Vortex started managing it, and warns when it has
 * files neither the game, the store nor Vortex put there. Runs in the background, a failure to verify is logged
 */
export const verifyIfStartedManaging = (api: types.IExtensionApi): void => {
  if (!startedManaging) {
    return;
  }
  startedManaging = false;

  warnAboutUnexpectedFilesAsync(api).catch((err) =>
    log("warn", "Failed to verify the game files", err),
  );
};

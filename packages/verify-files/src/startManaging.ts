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
 * Managing the game adds its profile without lastActivated, the profile's first activation sets it. The profiles the
 * profile editor adds start at 0
 */
const hasNeverActivatedProfile = (profiles: Profiles): boolean =>
  Object.values(profiles ?? {}).some(
    (profile) =>
      profile.gameId === GAME_ID && profile.lastActivated === undefined,
  );

/**
 * Whether Vortex started managing the game since the game was last activated
 */
let startedManaging = false;

/**
 * Vortex has no event for starting to manage a game. Managing it adds its first profile, activating that profile
 * sets the game up and activates it. Stopping to manage removes its profiles, managing it again adds one
 */
export const watchStartManaging = (api: types.IExtensionApi): void => {
  // Managing the game without the extension, from the stub Vortex has for the game, installs the extension and
  // restarts. Vortex manages the game on that start, which can add the profile before the extension watches the
  // profiles. A game already managed and activated before the extension was installed or updated isn't verified
  if (hasNeverActivatedProfile(api.getState().persistent.profiles)) {
    startedManaging = true;
  }

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
        "1 file in the game folder does not match the {{store}} build and was not deployed by Vortex (such as a " +
          "manually installed mod or a modified game file). These files can cause crashes or mod conflicts. Review " +
          "it on the Game Files page to archive or delete it.",
        { store },
      )
    : t(
        "{{count}} files in the game folder do not match the {{store}} build and were not deployed by Vortex (such as " +
          "manually installed mods or modified game files). These files can cause crashes or mod conflicts. Review " +
          "them on the Game Files page to archive or delete them.",
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

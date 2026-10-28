import { log, selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { LocalizationManager } from "@bannerlord/core/localization/manager";
import { verifyAndKeepAsync } from "./keptReport";
import { getStoreName, getVerifyStore, UNEXPECTED_SOURCES } from "./verify";
import { VERIFY_FILES_PAGE_ID } from "./views/options";
import { getStatusLabel } from "./views/tableAttributes";

// The files listed in the dialog, the rest are counted
const LISTED_FILES = 30;

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
  // Like the page's rows, a DLC's file by its package
  const listed = unexpected
    .slice(0, LISTED_FILES)
    .map(
      (file) =>
        `${getStatusLabel(t, file.status)}: ${file.package !== undefined ? `${file.package.name} › ${file.path}` : file.path}`,
    );
  if (unexpected.length > LISTED_FILES) {
    listed.push(
      t("...and {{count}} more", {
        count: `${unexpected.length - LISTED_FILES}`,
      }),
    );
  }
  const reviewLabel = t("Review");
  const result = await api.showDialog?.(
    "info",
    t("The Game Folder Has Unexpected Files"),
    {
      text: t(
        "{{count}} files don't match the {{store}} build and weren't deployed by Vortex, like mods copied in by hand " +
          "or changed game files. They often break the game and the mods Vortex installs. Review them on the Game " +
          "files page, where they can be archived or deleted.",
        { count: `${unexpected.length}`, store: getStoreName(report.store) },
      ),
      message: listed.join("\n"),
    },
    [{ label: t("Close") }, { label: reviewLabel }],
  );
  if (result?.action === reviewLabel) {
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

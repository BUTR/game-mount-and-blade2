import { log, selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { LocalizationManager } from "@bannerlord/core/localization/manager";
import { Localize } from "@bannerlord/core/localization/types";
import { archiveFilesAsync } from "./archive";
import { IVerifyFile, IVerifyFilesReport } from "./types";
import { showUnexpectedFilesAsync } from "./unexpectedFilesDialog";
import {
  getStoreName,
  getVerifyStore,
  isDeletable,
  UNEXPECTED_SOURCES,
  verifyFilesAsync,
} from "./verify";

/**
 * The name of the Nexus collection the download is, undefined for any other download. Vortex marks a collection's
 * download with its collection and revision when it downloads it
 */
export const getDownloadedCollectionName = (
  state: types.IState,
  archiveId: string | undefined,
): string | undefined => {
  if (archiveId === undefined) {
    return undefined;
  }
  const modInfo = state.persistent.downloads?.files?.[archiveId]?.modInfo as
    | {
        name?: string;
        nexus?: { ids?: { collectionId?: unknown; revisionId?: unknown } };
      }
    | undefined;
  const ids = modInfo?.nexus?.ids;
  if (ids?.collectionId == null && ids?.revisionId == null) {
    return undefined;
  }
  return modInfo?.name ?? "";
};

export const getCollectionText = (
  t: Localize,
  collection: string,
  store: string,
  files: readonly IVerifyFile[],
  archivable: number,
): string => {
  const name = collection !== "" ? collection : t("The collection");
  const parts = [
    files.length === 1
      ? t(
          "{{collection}} is best installed on a clean game folder, but 1 file in it doesn't match the {{store}} " +
            "build and wasn't deployed by Vortex. Such files, like mods copied in by hand, often break the " +
            "collection's mods. The installation waits until you choose.",
          { collection: name, store },
        )
      : t(
          "{{collection}} is best installed on a clean game folder, but {{count}} files in it don't match the " +
            "{{store}} build and weren't deployed by Vortex. Such files, like mods copied in by hand, often break " +
            "the collection's mods. The installation waits until you choose.",
          { collection: name, store, count: `${files.length}` },
        ),
  ];
  if (archivable > 0) {
    parts.push(
      t(
        "Archiving moves the extra files out of the game folder, they can be restored from Archives on the Game " +
          "files page.",
      ),
    );
  }
  if (archivable < files.length) {
    parts.push(
      t(
        "Changed and missing game files can't be archived, verifying the game in {{store}} restores them.",
        { store },
      ),
    );
  }
  return parts.join(" ");
};

/**
 * Moves the files into an archive named after the collection, its progress in Vortex's activity notification. A
 * failure is shown, the installation goes on either way
 */
const archiveBeforeCollectionAsync = async (
  api: types.IExtensionApi,
  gamePath: string,
  report: IVerifyFilesReport,
  files: IVerifyFile[],
  collection: string,
): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);
  const message = t("Archiving {{count}} files", {
    count: `${files.length}`,
  });
  const notificationId = api.sendNotification?.({
    type: "activity",
    message,
    noDismiss: true,
  });
  // Shown again only when the whole percent changes
  let percent = -1;
  try {
    const { kept } = await archiveFilesAsync(
      gamePath,
      report.store,
      report.buildId,
      files,
      {
        name:
          collection !== ""
            ? t("Before installing {{collection}}", { collection })
            : t("Before installing a collection"),
        ...(report.version !== undefined ? { version: report.version } : {}),
        onProgress: (fraction) => {
          const next = Math.min(100, Math.floor(fraction * 100));
          if (next === percent || notificationId === undefined) {
            return;
          }
          percent = next;
          api.sendNotification?.({
            id: notificationId,
            type: "activity",
            message,
            noDismiss: true,
            progress: percent,
          });
        },
      },
    );
    if (kept.length > 0) {
      api.sendNotification?.({
        type: "warning",
        message: t(
          "{{count}} files changed while they were archived and were left in the game folder",
          { count: `${kept.length}` },
        ),
      });
    }
  } catch (err) {
    api.showErrorNotification?.(t("Failed to archive the files"), err, {
      allowReport: false,
    });
  } finally {
    if (notificationId !== undefined) {
      api.dismissNotification?.(notificationId);
    }
  }
};

/**
 * Verifies the game folder before a collection installs, and when it has files neither the game, the store nor Vortex
 * put there, shows them and waits for the user to archive them or go on
 */
const checkBeforeCollectionAsync = async (
  api: types.IExtensionApi,
  collection: string,
): Promise<void> => {
  const state = api.getState();
  const gamePath = selectors.discoveryByGame(state, GAME_ID)?.path;
  // The other stores have no list of the build's files
  if (gamePath === undefined || getVerifyStore(state) === undefined) {
    return;
  }

  const { localize: t } = LocalizationManager.getInstance(api);
  // The installation waits meanwhile, the notification tells why
  const notificationId = api.sendNotification?.({
    type: "activity",
    message: t("Checking the game folder before installing the collection"),
    noDismiss: true,
  });
  let report: IVerifyFilesReport;
  try {
    report = await verifyFilesAsync(api);
  } finally {
    if (notificationId !== undefined) {
      api.dismissNotification?.(notificationId);
    }
  }

  const unexpected = report.files.filter((file) =>
    UNEXPECTED_SOURCES.includes(file.source),
  );
  if (unexpected.length === 0) {
    return;
  }
  const archivable = unexpected.filter(isDeletable);
  const action = await showUnexpectedFilesAsync(api, report, unexpected, {
    title: t("Clean the Game Folder Before Installing?"),
    text: getCollectionText(
      t,
      collection,
      getStoreName(report.store),
      unexpected,
      archivable.length,
    ),
    actions:
      archivable.length > 0
        ? [
            { id: "continue", label: t("Continue Without Cleaning") },
            {
              id: "archive",
              label: t("Archive {{count}} Files and Continue", {
                count: `${archivable.length}`,
              }),
              primary: true,
            },
          ]
        : [{ id: "continue", label: t("Continue"), primary: true }],
    dismissAction: "continue",
  });
  if (action === "archive") {
    await archiveBeforeCollectionAsync(
      api,
      gamePath,
      report,
      archivable,
      collection,
    );
  }
};

/**
 * Vortex installs a collection's own download before anything of the collection, and awaits will-install-mod before
 * that, on every Vortex version. Holding it holds the collection's installation until the user answers. It can't
 * cancel it, Vortex's own dialog asking to install the collection comes next
 */
export const watchCollectionInstalls = (api: types.IExtensionApi): void => {
  api.onAsync?.(
    "will-install-mod",
    async (gameId: string, archiveId: string | undefined) => {
      if (gameId !== GAME_ID) {
        return;
      }
      const collection = getDownloadedCollectionName(api.getState(), archiveId);
      if (collection === undefined) {
        return;
      }
      // A failure would be shown as an error of the event, and the installation goes on anyway
      try {
        await checkBeforeCollectionAsync(api, collection);
      } catch (err) {
        log("warn", "Failed to check the game folder before a collection", err);
      }
    },
  );
};

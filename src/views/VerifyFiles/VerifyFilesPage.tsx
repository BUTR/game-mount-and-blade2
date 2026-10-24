import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Icon,
  MainContext,
  MainPage,
  selectors,
  util,
} from "@nexusmods/vortex-api";
import { useSelector } from "react-redux";
import {
  archiveFilesAsync,
  deleteArchiveAsync,
  IFilesArchive,
  readArchivesAsync,
  renameArchiveAsync,
  restoreArchiveAsync,
} from "../../verifyFiles/archive";
import {
  findModuleConflictsAsync,
  getVersionMismatch,
} from "../../verifyFiles/restoreChecks";
import {
  deleteFilesAsync,
  getFolder,
  isDeletable,
  getVerifyStore,
  showModInModsPage,
  verifyFilesAsync,
} from "../../verifyFiles/verify";
import {
  IVerifyFile,
  IVerifyFilesReport,
  VerifyFileSource,
  VerifyFileStatus,
} from "../../verifyFiles/types";
import {
  formatGameVersion,
  formatSize,
  getStatusLabel,
  getFolderActions,
  getVerifyFileActions,
  getVerifyFileColumns,
  getVerifyFileId,
  RemoveFilesActions,
} from "./tableAttributes";
import { ArchiveFiles } from "./ArchiveFiles";
import { ArchivesTable } from "./ArchivesTable";
import { FilesTable } from "./FilesTable";
import { ActionButton } from "../Shared/components/Controls";
import { TableToolbar, ToolbarViews } from "../Shared/components/TableToolbar";
import { ModernPageHeader } from "../Shared/components/ModernPageHeader";
import { useLocalization } from "../../localization/hooks";
import { GAME_ID } from "../../common";
import { IStateWithBannerlord } from "../../types";

/**
 * unexpected: the files that usually break the game, neither the game's, the store's nor Vortex's
 */
type VerifyView = "unexpected" | "game" | "vortex" | "all" | "archives";

const VIEW_SOURCES: Record<
  Exclude<VerifyView, "all" | "archives">,
  VerifyFileSource[]
> = {
  unexpected: ["unknown"],
  game: ["game", "store"],
  vortex: ["vortex", "vortexInternal"],
};

const STATUSES: VerifyFileStatus[] = ["extra", "changed", "missing"];

// The files listed in the delete confirmation, the rest are counted
const LISTED_DELETE_FILES = 30;

// The archive's name in the archive and rename dialogs
const ARCHIVE_NAME_INPUT = "name";

const matchesView = (file: IVerifyFile, view: VerifyView): boolean =>
  view === "all" ||
  (view !== "archives" && VIEW_SOURCES[view].includes(file.source));

const matchesFileSearch = (file: IVerifyFile, needle: string): boolean =>
  file.path.toLowerCase().includes(needle) ||
  file.modName?.toLowerCase().includes(needle) === true;

/**
 * An archiving, deleting or restoring that's running, with its progress when it has one
 */
type Work = { message: string; percent: number | null };

export type VerifyFilesPageProps = {
  /**
   * Whether the page is shown, Vortex keeps it mounted after it's opened once
   */
  active?: boolean;
};

export const VerifyFilesPage: FC<VerifyFilesPageProps> = ({ active }) => {
  const context = useContext(MainContext);
  const api = context.api;

  const { localize: t } = useLocalization();

  const gamePath = useSelector(
    (state: IStateWithBannerlord) =>
      selectors.discoveryByGame(state, GAME_ID)?.path,
  );

  const [report, setReport] = useState<IVerifyFilesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [work, setWork] = useState<Work | null>(null);
  const working = work !== null;
  const [archives, setArchives] = useState<IFilesArchive[]>([]);
  const [view, setView] = useState<VerifyView>("unexpected");
  // The archive whose files the Archives view shows, by its path, it's read again after restoring
  const [openArchivePath, setOpenArchivePath] = useState<string | null>(null);
  const openArchive = archives.find(
    (archive) => archive.archivePath === openArchivePath,
  );

  const verifyAsync = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [next, nextArchives] = await Promise.all([
        verifyFilesAsync(api),
        // A broken archives folder doesn't keep the files from being listed
        readArchivesAsync().catch((): IFilesArchive[] => []),
      ]);
      setReport(next);
      setArchives(nextArchives);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Every time the page is opened, deploying or the game can have changed the files since
  useEffect(() => {
    if (active !== false) {
      void verifyAsync();
    }
  }, [active, verifyAsync]);

  const store = useSelector((state: IStateWithBannerlord) =>
    getVerifyStore(state),
  );
  const storeUrl = report?.storeUrl;
  const openInStore = useCallback((): void => {
    if (storeUrl !== undefined) {
      util.opn(storeUrl).catch(() => null);
    }
  }, [storeUrl]);
  const storeActionLabel =
    store === "gog" ? t("Open in GOG Galaxy") : t("Verify in Steam");
  const storeActionTitle =
    store === "gog"
      ? t(
          "GOG Galaxy's Verify / Repair, in the game's settings, restores the missing and changed files of the game. " +
            "It doesn't remove extra files",
        )
      : t(
          "Steam restores the missing and changed files of the game. It doesn't remove extra files",
        );

  const files = useMemo(() => report?.files ?? [], [report]);
  const viewCounts = useMemo(
    () => ({
      unexpected: files.filter((file) => matchesView(file, "unexpected"))
        .length,
      game: files.filter((file) => matchesView(file, "game")).length,
      vortex: files.filter((file) => matchesView(file, "vortex")).length,
      all: files.length,
    }),
    [files],
  );
  const viewFiles = useMemo(
    () => files.filter((file) => matchesView(file, view)),
    [files, view],
  );

  /**
   * Runs a long change of the game folder or the archives, its progress on the page and in Vortex's activity
   * notification, then verifies again
   */
  const runWorkAsync = useCallback(
    async (
      message: string,
      failure: string,
      run: (onProgress: (fraction: number) => void) => Promise<void>,
    ): Promise<void> => {
      setWork({ message, percent: null });
      const notificationId = api.sendNotification?.({
        type: "activity",
        message,
        noDismiss: true,
      });
      // Shown again only when the whole percent changes
      let percent = -1;
      const onProgress = (fraction: number): void => {
        const next = Math.min(100, Math.floor(fraction * 100));
        if (next === percent) {
          return;
        }
        percent = next;
        setWork({ message, percent });
        if (notificationId !== undefined) {
          api.sendNotification?.({
            id: notificationId,
            type: "activity",
            message,
            noDismiss: true,
            progress: percent,
          });
        }
      };
      try {
        await run(onProgress);
      } catch (err) {
        api.showErrorNotification?.(failure, err, { allowReport: false });
      } finally {
        if (notificationId !== undefined) {
          api.dismissNotification?.(notificationId);
        }
        setWork(null);
      }
      await verifyAsync();
    },
    [api, verifyAsync],
  );

  /**
   * Asks first, listing the files, then moves them into an archive or deletes them
   */
  const removeAsync = useCallback(
    async (
      toRemove: IVerifyFile[],
      mode: "archive" | "delete",
    ): Promise<void> => {
      if (gamePath === undefined || report === null || toRemove.length === 0) {
        return;
      }
      const confirmLabel = mode === "archive" ? t("Archive") : t("Delete");
      const count = `${toRemove.length}`;
      const size = formatSize(
        toRemove.reduce((total, file) => total + (file.size ?? 0), 0),
      );
      const listed = toRemove
        .slice(0, LISTED_DELETE_FILES)
        .map((file) => file.path);
      if (toRemove.length > LISTED_DELETE_FILES) {
        listed.push(
          t("...and {{count}} more", {
            count: `${toRemove.length - LISTED_DELETE_FILES}`,
          }),
        );
      }
      const text =
        mode === "archive"
          ? t(
              "Move these {{count}} files ({{size}}) out of the game folder into an archive? They're stored " +
                "uncompressed, so the archive takes the same space. They're removed from the game folder only once " +
                "the archive is complete, and can be restored from Archives.",
              { count, size },
            )
          : toRemove.length === 1
            ? t("Delete this file from the game folder? It can't be restored.")
            : t(
                "Delete these {{count}} files ({{size}}) from the game folder? They can't be restored.",
                { count, size },
              );
      const result = await api.showDialog?.(
        "question",
        mode === "archive" ? t("Archive Files") : t("Delete Files"),
        {
          text,
          message: listed.join("\n"),
          ...(mode === "archive"
            ? {
                input: [
                  {
                    id: ARCHIVE_NAME_INPUT,
                    type: "text",
                    label: t("Name (optional)"),
                    placeholder: t("Like the mods the files are from"),
                  },
                ],
              }
            : {}),
        },
        [{ label: t("Cancel") }, { label: confirmLabel }],
      );
      if (result?.action !== confirmLabel) {
        return;
      }
      const name = String(result.input?.[ARCHIVE_NAME_INPUT] ?? "");
      const { store, buildId, version } = report;
      await runWorkAsync(
        mode === "archive"
          ? t("Archiving {{count}} files", { count })
          : t("Deleting {{count}} files", { count }),
        mode === "archive"
          ? t("Failed to archive the files")
          : t("Failed to delete the files"),
        async (onProgress) => {
          if (mode === "delete") {
            await deleteFilesAsync(gamePath, toRemove);
            return;
          }
          const { kept } = await archiveFilesAsync(
            gamePath,
            store,
            buildId,
            toRemove,
            {
              name,
              ...(version !== undefined ? { version } : {}),
              onProgress,
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
        },
      );
    },
    [api, t, gamePath, report, runWorkAsync],
  );
  const removeActions = useMemo<RemoveFilesActions>(
    () => ({
      onArchive: (toArchive) => void removeAsync(toArchive, "archive"),
      onDelete: (toDelete) => void removeAsync(toDelete, "delete"),
    }),
    [removeAsync],
  );

  /**
   * Asks first, then puts the archive's files, or only some of them, back into the game folder
   */
  /**
   * Asks first, warning when the archive is from another game version or has modules the game folder has again,
   * then puts the archive's files, or only some of them, back into the game folder
   */
  const restoreAsync = useCallback(
    async (archive: IFilesArchive, paths?: string[]): Promise<void> => {
      if (gamePath === undefined || report === null || paths?.length === 0) {
        return;
      }
      const archiveName =
        archive.name ?? new Date(archive.createdAt).toLocaleString();
      let toRestore = paths ?? archive.files.map((file) => file.path);
      // A warning asks to continue, the plain question is only needed without one
      let confirmed = false;

      const mismatch = getVersionMismatch(archive, report);
      if (mismatch !== undefined) {
        const continueLabel = t("Restore Anyway");
        const result = await api.showDialog?.(
          "question",
          t("Game Version Mismatch"),
          {
            text: t(
              "The files of {{archive}} were archived from {{archived}}, the game is now {{installed}}. Mods " +
                "made for one version of the game often don't work with another, and can keep it from starting. " +
                "Restore them anyway?",
              {
                archive: archiveName,
                archived: formatGameVersion(t, mismatch.archived),
                installed: formatGameVersion(t, mismatch.installed),
              },
            ),
          },
          [{ label: t("Cancel") }, { label: continueLabel }],
        );
        if (result?.action !== continueLabel) {
          return;
        }
        confirmed = true;
      }

      const conflicts = await findModuleConflictsAsync(
        gamePath,
        report,
        toRestore,
      );
      if (conflicts.length > 0) {
        const skipLabel = t("Skip These Modules");
        const mergeLabel = t("Restore Anyway");
        const result = await api.showDialog?.(
          "question",
          t("Modules Already in the Game Folder"),
          {
            text: t(
              "The game folder has these modules of {{archive}} again. Restoring adds the archived files the " +
                "folders don't have, mixing two versions of a module, which can break it. Files the folders " +
                "have are left as they are either way.",
              { archive: archiveName },
            ),
            message: conflicts
              .map(({ folder, deployedByVortex }) =>
                deployedByVortex
                  ? t("{{folder}}, deployed by Vortex", { folder })
                  : t("{{folder}}, not deployed by Vortex", { folder }),
              )
              .join("\n"),
          },
          [{ label: t("Cancel") }, { label: mergeLabel }, { label: skipLabel }],
        );
        if (result?.action === skipLabel) {
          const skipped = new Set(conflicts.map(({ folder }) => folder));
          toRestore = toRestore.filter(
            (filePath) => !skipped.has(getFolder(filePath)),
          );
          if (toRestore.length === 0) {
            api.sendNotification?.({
              type: "info",
              message: t(
                "Nothing to restore, the game folder has all of the modules again",
              ),
              displayMS: 5000,
            });
            return;
          }
        } else if (result?.action !== mergeLabel) {
          return;
        }
        confirmed = true;
      }

      const count = `${toRestore.length}`;
      if (!confirmed) {
        const restoreLabel = t("Restore");
        const result = await api.showDialog?.(
          "question",
          t("Restore Files"),
          {
            text: t(
              "Put {{count}} files of the archive {{archive}} back into the game folder? Files the game folder " +
                "has again are left as they are. The archive is kept.",
              { count, archive: archiveName },
            ),
          },
          [{ label: t("Cancel") }, { label: restoreLabel }],
        );
        if (result?.action !== restoreLabel) {
          return;
        }
      }

      const only = new Set(toRestore);
      await runWorkAsync(
        t("Restoring {{count}} files", { count }),
        t("Failed to restore the files"),
        async (onProgress) => {
          const { restored, skipped } = await restoreArchiveAsync(
            gamePath,
            archive,
            { only, onProgress },
          );
          api.sendNotification?.({
            type: "success",
            message:
              skipped === 0
                ? t("Restored {{count}} files", { count: `${restored}` })
                : t(
                    "Restored {{count}} files, {{skipped}} were left as the game folder has them again",
                    { count: `${restored}`, skipped: `${skipped}` },
                  ),
            displayMS: 5000,
          });
        },
      );
    },
    [api, t, gamePath, report, runWorkAsync],
  );

  const confirmRenameArchiveAsync = useCallback(
    async (archive: IFilesArchive): Promise<void> => {
      const renameLabel = t("Rename");
      const result = await api.showDialog?.(
        "question",
        t("Rename Archive"),
        {
          text: t("A blank name shows the archive by its date."),
          input: [
            {
              id: ARCHIVE_NAME_INPUT,
              type: "text",
              label: t("Name"),
              value: archive.name ?? "",
            },
          ],
        },
        [{ label: t("Cancel") }, { label: renameLabel }],
      );
      if (result?.action !== renameLabel) {
        return;
      }
      try {
        await renameArchiveAsync(
          archive,
          String(result.input?.[ARCHIVE_NAME_INPUT] ?? ""),
        );
        setArchives(await readArchivesAsync());
      } catch (err) {
        api.showErrorNotification?.(t("Failed to rename the archive"), err, {
          allowReport: false,
        });
      }
    },
    [api, t],
  );

  const confirmDeleteArchiveAsync = useCallback(
    async (archive: IFilesArchive): Promise<void> => {
      const deleteLabel = t("Delete");
      const result = await api.showDialog?.(
        "question",
        t("Delete Archive"),
        {
          text: t(
            "Delete the archive {{archive}}? Its {{count}} files can't be restored then.",
            {
              archive:
                archive.name ?? new Date(archive.createdAt).toLocaleString(),
              count: `${archive.files.length}`,
            },
          ),
        },
        [{ label: t("Cancel") }, { label: deleteLabel }],
      );
      if (result?.action !== deleteLabel) {
        return;
      }
      await runWorkAsync(
        t("Deleting the archive"),
        t("Failed to delete the archive"),
        () => deleteArchiveAsync(archive),
      );
    },
    [api, t, runWorkAsync],
  );

  const showMod = useCallback(
    (modId: string): void => showModInModsPage(api, modId),
    [api],
  );
  const getColumns = useCallback(
    (groupedByFolder: boolean) =>
      getVerifyFileColumns(t, groupedByFolder, showMod),
    [t, showMod],
  );
  const rowActions = useMemo(
    () => getVerifyFileActions(t, gamePath ?? "", showMod, removeActions),
    [t, gamePath, showMod, removeActions],
  );
  const folderActions = useMemo(
    () => getFolderActions(t, gamePath ?? "", removeActions),
    [t, gamePath, removeActions],
  );
  const statusFilters = useMemo(
    () =>
      STATUSES.map((status) => ({
        id: status,
        label: getStatusLabel(t, status),
        matches: (file: IVerifyFile) => file.status === status,
      })),
    [t],
  );
  const removeButtons = useCallback(
    (shown: IVerifyFile[]) => {
      const deletable = shown.filter(isDeletable);
      if (deletable.length === 0) {
        return null;
      }
      const removeCount = { count: `${deletable.length}` };
      return (
        <>
          <ActionButton
            variant="weak"
            icon={working ? "spinner" : "archive"}
            spin={working}
            disabled={working || loading}
            title={t(
              "Moves the extra files the list shows into an archive, except the ones Vortex and the store " +
                "manage. They can be restored from Archives",
            )}
            onClick={() => void removeAsync(deletable, "archive")}
          >
            {t("Archive {{count}} Files", removeCount)}
          </ActionButton>
          <button
            type="button"
            className="bls-btn bls-btn-weak bls-btn-icon"
            aria-label={t("Delete {{count}} Files", removeCount)}
            title={t("Delete {{count}} Files", removeCount)}
            disabled={working || loading}
            onClick={() => void removeAsync(deletable, "delete")}
          >
            <Icon name="delete" />
          </button>
        </>
      );
    },
    [t, working, loading, removeAsync],
  );

  const storeName = store === "gog" ? "GOG" : "Steam";
  const header = (
    <ModernPageHeader
      pictogram="verify"
      title={t("Game Files")}
      subtitle={
        report !== null
          ? t(
              "The game folder compared to the files of {{version}} from {{store}}. Mods copied into the game " +
                "folder by hand, the files that usually break the game, are listed as Unexpected.",
              {
                store: storeName,
                version: formatGameVersion(t, report),
              },
            )
          : t(
              "The game folder compared to the files of the {{store}} build, to find the files that don't belong " +
                "to it.",
              { store: storeName },
            )
      }
      actions={
        <>
          <ActionButton
            variant="weak"
            icon={loading ? "spinner" : "refresh"}
            spin={loading}
            disabled={loading || working}
            onClick={() => void verifyAsync()}
          >
            {t("Verify Again")}
          </ActionButton>
          {report !== null && (
            <ActionButton
              variant="weak"
              icon="open-ext"
              title={storeActionTitle}
              onClick={openInStore}
            >
              {storeActionLabel}
            </ActionButton>
          )}
        </>
      }
    />
  );

  const views = (
    <ToolbarViews
      label={t("Views")}
      views={[
        {
          id: "unexpected",
          label: t("Unexpected"),
          count: viewCounts.unexpected,
        },
        {
          id: "game",
          label: t("Game and Store"),
          count: viewCounts.game,
        },
        {
          id: "vortex",
          label: t("From Vortex"),
          count: viewCounts.vortex,
        },
        { id: "all", label: t("All"), count: viewCounts.all },
        { id: "archives", label: t("Archives"), count: archives.length },
      ]}
      selected={view}
      onSelect={(id) => {
        setView(id as VerifyView);
        setOpenArchivePath(null);
      }}
    />
  );

  const workBar =
    work !== null ? (
      <div className="bls-verify-work bls-small" role="status">
        <Icon name="spinner" />
        <span className="bls-progress-text">{work.message}</span>
        {work.percent !== null && (
          <>
            <span
              className="bls-progress"
              role="progressbar"
              aria-label={work.message}
              aria-valuenow={work.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${work.percent}%` }} />
            </span>
            <span className="bls-progress-text">{`${work.percent}%`}</span>
          </>
        )}
      </div>
    ) : null;

  const renderArchives = (): JSX.Element =>
    openArchive !== undefined ? (
      <ArchiveFiles
        key={openArchive.archivePath}
        archive={openArchive}
        gamePath={gamePath ?? ""}
        busy={working || loading}
        onBack={() => setOpenArchivePath(null)}
        onRestore={(paths) => void restoreAsync(openArchive, paths)}
      />
    ) : (
      <>
        <TableToolbar start={views} />
        <ArchivesTable
          archives={archives}
          busy={working || loading}
          onOpen={(archive) => setOpenArchivePath(archive.archivePath)}
          onRestore={(archive) => void restoreAsync(archive)}
          onRename={(archive) => void confirmRenameArchiveAsync(archive)}
          onDelete={(archive) => void confirmDeleteArchiveAsync(archive)}
        />
      </>
    );

  const renderFiles = (): JSX.Element => (
    <FilesTable
      tableId="bannerlord-verify-files"
      label={t("Files")}
      rows={viewFiles}
      getId={getVerifyFileId}
      getColumns={getColumns}
      groupBy={[
        { columnId: "folder", label: t("Folder") },
        { columnId: "status", label: t("Status") },
        { columnId: "source", label: t("Source") },
      ]}
      filterTitle={t("Status")}
      filters={statusFilters}
      searchLabel={t("Search files")}
      matchesSearch={matchesFileSearch}
      rowActions={rowActions}
      folderActions={folderActions}
      toolbarStart={views}
      toolbarActions={removeButtons}
      empty={
        <div className="bls-empty bls-small">
          <span className="bls-empty-icon">
            <Icon name="toggle-enabled" />
          </span>
          <h2>{t("Nothing to show here")}</h2>
          <p>
            {view === "unexpected"
              ? t(
                  "Every file in the game folder is part of the game, was deployed by Vortex or was created by the game.",
                )
              : t("The game folder has no files of this kind.")}
          </p>
        </div>
      }
    />
  );

  const renderBody = (): JSX.Element => {
    if (report === null) {
      if (error !== null && !loading) {
        return (
          <div className="bls-empty bls-small">
            <span className="bls-empty-icon">
              <Icon name="feedback-error" />
            </span>
            <h2>{t("The game files couldn't be verified")}</h2>
            <p>{error}</p>
          </div>
        );
      }
      return (
        <div className="bls-empty bls-small" role="status">
          <span className="bls-empty-icon">
            <Icon name="spinner" />
          </span>
          <h2>{t("Verifying the game files...")}</h2>
          <p>
            {t("Comparing the game folder to the {{store}} build.", {
              store: storeName,
            })}
          </p>
        </div>
      );
    }

    if (report.missingLists.length > 0) {
      const missing = report.missingLists.join(", ");
      return (
        <div className="bls-empty bls-small">
          <span className="bls-empty-icon">
            <Icon name="feedback-warning" />
          </span>
          <h2>
            {t("{{store}}'s file list of this build is missing", {
              store: storeName,
            })}
          </h2>
          <p>
            {report.store === "gog"
              ? t(
                  "GOG installs the file list of the game next to it, but the one of product {{products}} is " +
                    "gone. Repairing the game in GOG Galaxy brings it back.",
                  { products: missing },
                )
              : t(
                  "Steam keeps the file list of the build it installed, but the one of depot {{depots}} is gone. " +
                    "Verifying the game in Steam brings it back.",
                  { depots: missing },
                )}
          </p>
          <ActionButton variant="subdued" onClick={openInStore}>
            {storeActionLabel}
          </ActionButton>
        </div>
      );
    }

    const countOf = (status: VerifyFileStatus): number =>
      files.filter((file) => file.status === status).length;

    return (
      <>
        <div className="bls-summary bls-small">
          <div className="bls-summary-card">
            <span className="bls-title-xs">{t("Files Checked")}</span>
            <span className="bls-summary-value">
              {report.expectedFileCount.toLocaleString()}
            </span>
          </div>
          <div className="bls-summary-card">
            <span className="bls-title-xs">{t("Unexpected")}</span>
            <span className="bls-summary-value">{viewCounts.unexpected}</span>
          </div>
          <div
            className="bls-summary-card"
            title={
              report.sizesKnown
                ? undefined
                : t(
                    "GOG Galaxy didn't install the game, so the sizes of its files and the changed files are unknown",
                  )
            }
          >
            <span className="bls-title-xs">{t("Changed")}</span>
            <span className="bls-summary-value">
              {report.sizesKnown ? countOf("changed") : "—"}
            </span>
          </div>
          <div className="bls-summary-card">
            <span className="bls-title-xs">{t("Missing")}</span>
            <span className="bls-summary-value">{countOf("missing")}</span>
          </div>
        </div>
        {workBar}
        {view === "archives" ? renderArchives() : renderFiles()}
      </>
    );
  };

  return (
    <MainPage>
      <MainPage.Body>
        <div className="bls-page">
          {header}
          {renderBody()}
        </div>
      </MainPage.Body>
    </MainPage>
  );
};

import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  getArchiveSpaceAsync,
  IFilesArchive,
  readArchivesAsync,
  renameArchiveAsync,
  restoreArchiveAsync,
} from "../archive";
import { findModuleConflictsAsync, getVersionMismatch } from "../restoreChecks";
import { takeKeptReport } from "../keptReport";
import {
  deleteFilesAsync,
  getFolder,
  isDeletable,
  getStoreName,
  getVerifyStore,
  showModInModsPage,
  UNEXPECTED_SOURCES,
  verifyFilesAsync,
} from "../verify";
import {
  IVerifyFile,
  IVerifyFilesReport,
  VerifyFileSource,
  VerifyFileStatus,
  VerifyStore,
} from "../types";
import {
  formatGameVersion,
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
import { ActionButton } from "@bannerlord/ui/components/Controls";
import { EmptyState } from "@bannerlord/ui/components/EmptyState";
import { formatSize } from "@bannerlord/ui/format";
import {
  TableToolbar,
  ToolbarViews,
} from "@bannerlord/ui/components/TableToolbar";
import { ModernPageHeader } from "@bannerlord/ui/components/ModernPageHeader";
import { useLocalization } from "@bannerlord/core/localization/hooks";
import { GAME_ID } from "@bannerlord/core/common";
import { IStateWithBannerlord } from "@bannerlord/core/types";

/**
 * unexpected: the files that usually break the game, neither the game's, the store's nor Vortex's
 */
type VerifyView = "unexpected" | "game" | "vortex" | "all" | "archives";

const VIEW_SOURCES: Record<
  Exclude<VerifyView, "all" | "archives">,
  readonly VerifyFileSource[]
> = {
  unexpected: UNEXPECTED_SOURCES,
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

  // A verification started after this one replaces its result, the store or the folder may have changed meanwhile
  const latestVerification = useRef(0);
  /**
   * Shows the report of a verification already done instead of verifying, when given one
   */
  const verifyAsync = useCallback(
    async (verified?: IVerifyFilesReport): Promise<void> => {
      const verification = ++latestVerification.current;
      const isLatest = (): boolean =>
        verification === latestVerification.current;
      setLoading(true);
      try {
        const [next, nextArchives] = await Promise.all([
          verified ?? verifyFilesAsync(api),
          // A broken archives folder doesn't keep the files from being listed
          readArchivesAsync().catch((): IFilesArchive[] => []),
        ]);
        if (isLatest()) {
          setReport(next);
          setArchives(nextArchives);
          setError(null);
        }
      } catch (err) {
        if (isLatest()) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isLatest()) {
          setLoading(false);
        }
      }
    },
    [api],
  );

  const discoveredStore = useSelector((state: IStateWithBannerlord) =>
    getVerifyStore(state),
  );

  // Every time the page is opened, deploying or the game can have changed the files since. And when the game's
  // store or folder changes, the report is of the build before. The report of the verification when Vortex started
  // managing the game is shown instead, Vortex didn't write into the folder since
  useEffect(() => {
    if (active !== false) {
      void verifyAsync(takeKeptReport(gamePath, discoveredStore));
    }
  }, [active, verifyAsync, discoveredStore, gamePath]);

  // The report's, its store link is too. The discovered one until there's a report
  const store = report?.store ?? discoveredStore;
  const storeUrl = report?.storeUrl;
  const openInStore = useCallback((): void => {
    if (storeUrl !== undefined) {
      util.opn(storeUrl).catch(() => null);
    }
  }, [storeUrl]);
  const storeAction = (
    {
      steam: {
        label: t("Verify in Steam"),
        title: t(
          "Steam restores missing and modified game files without removing extra files",
        ),
      },
      gog: {
        label: t("Open in GOG Galaxy"),
        title: t(
          "Verify / Repair in GOG Galaxy's game settings restores missing and modified game files without removing " +
            "extra files",
        ),
      },
      epic: {
        label: t("Verify in Epic"),
        title: t(
          "Verifies the game in the Epic Games Launcher to restore missing and modified game files without removing " +
            "extra files",
        ),
      },
      xbox: {
        label: t("Open in the Xbox App"),
        title: t(
          "Verify and repair in the Xbox app (Manage > Files) restores missing and modified game files without " +
            "removing extra files",
        ),
      },
    } satisfies Record<VerifyStore, { label: string; title: string }>
  )[store ?? "steam"];
  const storeActionLabel = storeAction.label;
  const storeActionTitle = storeAction.title;
  const storeName = getStoreName(store ?? "steam");

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
      const count = `${toRemove.length}`;
      // Archiving is offered only when the archive fits. When the space can't be read, archiving checks it again
      if (mode === "archive") {
        const space = await getArchiveSpaceAsync(toRemove).catch(
          (): undefined => undefined,
        );
        if (space !== undefined && space.free < space.required) {
          await api.showDialog?.(
            "info",
            t("Not Enough Disk Space"),
            {
              text: t(
                "Archiving these {{count}} files requires {{required}} of free space on {{drive}} (where Vortex " +
                  "stores archives), but only {{free}} is available. Free up space on the drive and try again.",
                {
                  count,
                  required: formatSize(space.required),
                  drive: space.drive,
                  free: formatSize(space.free),
                },
              ),
            },
            [{ label: t("Close") }],
          );
          return;
        }
      }
      const confirmLabel = mode === "archive" ? t("Archive") : t("Delete");
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
              "Move these {{count}} files ({{size}}) out of the game folder into an archive? Files are stored " +
                "uncompressed (using the same disk space) and are only removed from the game folder once the " +
                "archive is complete. You can restore them anytime from the Archives tab.",
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
                    placeholder: t("e.g., manual mods backup"),
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
              "The files in '{{archive}}' were archived from {{archived}}, but the installed game is now " +
                "{{installed}}. Mods built for a different game version may cause crashes or prevent the game " +
                "from starting. Restore them anyway?",
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
              "The game folder already contains these modules from '{{archive}}'. Restoring will add any missing " +
                "files from the archive into those folders, which may mix two different versions of a module and " +
                "cause issues. Existing files will not be overwritten.",
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
                "Nothing to restore — all modules in this archive already exist in the game folder",
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
              "Restore {{count}} files from '{{archive}}' to the game folder? Existing files in the game folder " +
                "will not be overwritten, and the archive itself will be kept.",
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
                    "Restored {{count}} files ({{skipped}} existing files were skipped)",
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
          text: t(
            "Leave the name blank to display the archive's creation date instead.",
          ),
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
            "Permanently delete the archive '{{archive}}'? Its {{count}} files will no longer be restorable.",
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
      getVerifyFileColumns(t, groupedByFolder, showMod, storeName),
    [t, showMod, storeName],
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
              "Moves the listed extra files into an archive (excluding files managed by Vortex or the store). " +
                "You can restore them from the Archives tab.",
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

  const header = (
    <ModernPageHeader
      pictogram="verify"
      title={t("Game Files")}
      subtitle={
        report !== null
          ? t(
              "Comparing your game folder against {{version}} ({{store}}). Manually installed mods and other files " +
                "that can cause conflicts are listed under Unexpected.",
              {
                store: storeName,
                version: formatGameVersion(t, report),
              },
            )
          : t(
              "Comparing your game folder against the {{store}} build to find extra, modified, or missing files.",
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
        <EmptyState
          icon="toggle-enabled"
          title={t("Nothing to show here")}
          description={
            view === "unexpected"
              ? t(
                  "Every file in the game folder belongs to the base game, was deployed by Vortex, or was generated by the game.",
                )
              : t("The game folder has no files of this kind.")
          }
        />
      }
    />
  );

  const renderBody = (): JSX.Element => {
    if (report === null) {
      if (error !== null && !loading) {
        return (
          <EmptyState
            icon="feedback-error"
            title={t("The game files couldn't be verified")}
            description={error}
          />
        );
      }
      return (
        <EmptyState
          icon="spinner"
          status
          title={t("Verifying the game files...")}
          description={t("Comparing the game folder to the {{store}} build.", {
            store: storeName,
          })}
        />
      );
    }

    if (report.missingLists.length > 0) {
      const missing = report.missingLists.join(", ");
      return (
        <EmptyState
          icon="feedback-warning"
          title={t("{{store}}'s file list for this build is missing", {
            store: storeName,
          })}
          description={
            report.store === "gog"
              ? t(
                  "GOG stores its file list in the game folder, but the manifest for product {{products}} is " +
                    "missing. Repair the game in GOG Galaxy to restore it.",
                  { products: missing },
                )
              : // Steam's, Epic's and Xbox's manifests have the whole build, a missing one is an error
                t(
                  "Steam has not cached the file list for depot {{depots}} on this PC. Verify the game files in " +
                    "Steam once to download it, then click Verify Again here.",
                  { depots: missing },
                )
          }
        >
          <ActionButton variant="subdued" onClick={openInStore}>
            {storeActionLabel}
          </ActionButton>
        </EmptyState>
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
              !report.sizesKnown
                ? t(
                    "The game was not installed through GOG Galaxy, so expected file sizes are unavailable and modified files cannot be detected",
                  )
                : report.store === "xbox" && !report.contentsChecked
                  ? t(
                      "Could not read Gaming Services' unmodified file markers; only files with changed sizes can be detected",
                    )
                  : undefined
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

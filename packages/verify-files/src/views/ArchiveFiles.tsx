import path from "path";
import React, { FC, useCallback, useEffect, useMemo, useState } from "react";
import { Icon, tooltip } from "@nexusmods/vortex-api";
import { FilesTable } from "./FilesTable";
import { formatSize, openGameFolder, pathInFolder } from "./tableAttributes";
import { IFilesArchive } from "../archive";
import { getFolder } from "../verify";
import { useLocalization } from "@bannerlord/core/localization/hooks";
import { getPathExistsAsync } from "@bannerlord/core/utils";
import { ActionButton } from "@bannerlord/ui/components/Controls";
import {
  ModernTableColumn,
  RowMenu,
} from "@bannerlord/ui/components/ModernTable";

type Localize = (key: string, values?: Record<string, string>) => string;

/**
 * An archived file, and whether the game folder has it again, restoring skips it then. Undefined while it's read
 */
type ArchivedFileRow = {
  path: string;
  folder: string;
  size: number;
  present: boolean | undefined;
};

const getRowId = (row: ArchivedFileRow): string => row.path;

const getRestoreLabel = (t: Localize, row: ArchivedFileRow): string =>
  row.present === undefined
    ? ""
    : row.present
      ? t("Skipped, in the game")
      : t("Restored");

const isRestorable = (row: ArchivedFileRow): boolean => row.present === false;

const getColumns = (
  t: Localize,
  groupedByFolder: boolean,
): ModernTableColumn<ArchivedFileRow>[] => [
  {
    id: "path",
    label: t("File"),
    width: "minmax(320px, 1fr)",
    render: (row) => (
      <span className="bls-table-truncate" title={row.path}>
        {groupedByFolder ? pathInFolder(row) : row.path}
      </span>
    ),
    sortValue: (row) => row.path,
  },
  {
    id: "folder",
    label: t("Folder"),
    width: "minmax(160px, 0.4fr)",
    render: (row) => (
      <span className="bls-table-truncate" title={row.folder}>
        {row.folder}
      </span>
    ),
    sortValue: (row) => row.folder,
    groupValue: (row) => row.folder,
    toggleable: true,
  },
  {
    id: "restore",
    label: t("On Restore"),
    width: "200px",
    render: (row) =>
      row.present === undefined ? null : (
        <span className="bls-status">
          {row.present ? (
            <tooltip.Icon
              name="feedback-info"
              className="bls-muted"
              tooltip={t(
                "The game folder has this file again, restoring leaves it as it is",
              )}
            />
          ) : (
            <tooltip.Icon
              name="toggle-enabled"
              className="bls-ok"
              tooltip={t("Restoring puts this file back into the game folder")}
            />
          )}
          <span className="bls-status-label">{getRestoreLabel(t, row)}</span>
        </span>
      ),
    sortValue: (row) => getRestoreLabel(t, row) || null,
    groupValue: (row) => getRestoreLabel(t, row) || null,
    toggleable: true,
  },
  {
    id: "size",
    label: t("Size"),
    width: "96px",
    align: "end",
    render: (row) => formatSize(row.size),
    sortValue: (row) => row.size,
    firstDirection: "desc",
    toggleable: true,
  },
];

export type ArchiveFilesProps = {
  archive: IFilesArchive;
  gamePath: string;
  busy: boolean;
  onBack: () => void;
  /**
   * Restores these of the archive's files
   */
  onRestore: (paths: string[]) => void;
};

/**
 * An archive's files, from its list, with the main table's search, filters and grouping, restored all, by folder or
 * one by one
 */
export const ArchiveFiles: FC<ArchiveFilesProps> = (props) => {
  const { archive, gamePath, busy, onBack, onRestore } = props;
  const { localize: t } = useLocalization();

  // Read again when the archive is, after restoring
  const [present, setPresent] = useState<{
    archive: IFilesArchive;
    paths: ReadonlySet<string>;
  }>();
  useEffect(() => {
    let cancelled = false;
    const readAsync = async (): Promise<void> => {
      const paths = new Set<string>();
      for (const file of archive.files) {
        if (await getPathExistsAsync(path.join(gamePath, file.path))) {
          paths.add(file.path);
        }
      }
      if (!cancelled) {
        setPresent({ archive, paths });
      }
    };
    void readAsync();
    return () => {
      cancelled = true;
    };
  }, [archive, gamePath]);

  const presentPaths = present?.archive === archive ? present.paths : undefined;
  const rows = useMemo(
    () =>
      archive.files.map(
        (file): ArchivedFileRow => ({
          path: file.path,
          folder: getFolder(file.path),
          size: file.size,
          present: presentPaths?.has(file.path),
        }),
      ),
    [archive, presentPaths],
  );

  const getTableColumns = useCallback(
    (groupedByFolder: boolean) => getColumns(t, groupedByFolder),
    [t],
  );
  const filters = useMemo(
    () => [
      {
        id: "restored",
        label: t("Restored"),
        matches: (row: ArchivedFileRow) => row.present === false,
      },
      {
        id: "skipped",
        label: t("Skipped, in the game"),
        matches: (row: ArchivedFileRow) => row.present === true,
      },
    ],
    [t],
  );
  const matchesSearch = useCallback(
    (row: ArchivedFileRow, needle: string) =>
      row.path.toLowerCase().includes(needle),
    [],
  );
  const restore = useCallback(
    (toRestore: ArchivedFileRow[]): void =>
      onRestore(toRestore.filter(isRestorable).map((row) => row.path)),
    [onRestore],
  );

  const rowActions = useMemo(
    () => ({
      label: t("Actions"),
      width: "68px",
      render: (row: ArchivedFileRow) => {
        const openFolder = (): void =>
          openGameFolder(gamePath, path.dirname(row.path));
        const restoreLabel = t("Restore {{file}}", { file: row.path });
        return (
          <>
            <button
              type="button"
              className="bls-btn bls-btn-weak bls-btn-icon bls-row-hover-only"
              aria-label={restoreLabel}
              title={restoreLabel}
              disabled={busy || !isRestorable(row)}
              onClick={(event) => {
                event.stopPropagation();
                restore([row]);
              }}
            >
              <Icon name="undo" />
            </button>
            <RowMenu
              label={t("More actions")}
              items={[
                ...(isRestorable(row)
                  ? [
                      {
                        label: t("Restore File"),
                        onSelect: () => restore([row]),
                      },
                    ]
                  : []),
                { label: t("Open Folder"), onSelect: openFolder },
              ]}
            />
          </>
        );
      },
    }),
    [t, gamePath, busy, restore],
  );

  const folderActions = useCallback(
    (folder: string, shown: ArchivedFileRow[]) => {
      const restorable = shown.filter(isRestorable);
      const openFolder = (): void => openGameFolder(gamePath, folder);
      const openLabel = t("Open {{folder}}", {
        folder: folder !== "" ? folder : t("Game folder"),
      });
      return (
        <>
          <button
            type="button"
            className="bls-btn bls-btn-weak bls-btn-icon bls-row-hover-only"
            aria-label={openLabel}
            title={openLabel}
            onClick={openFolder}
          >
            <Icon name="open-ext" />
          </button>
          <RowMenu
            label={t("More actions")}
            items={[
              { label: t("Open Folder"), onSelect: openFolder },
              ...(restorable.length > 0
                ? [
                    {
                      label: t("Restore {{count}} Shown Files", {
                        count: `${restorable.length}`,
                      }),
                      onSelect: () => restore(restorable),
                    },
                  ]
                : []),
            ]}
          />
        </>
      );
    },
    [t, gamePath, restore],
  );

  const toolbarActions = useCallback(
    (shown: ArchivedFileRow[]) => {
      const restorable = shown.filter(isRestorable);
      return restorable.length > 0 ? (
        <ActionButton
          variant="weak"
          icon={busy ? "spinner" : "undo"}
          spin={busy}
          disabled={busy}
          title={t(
            "Puts the files the list shows back into the game folder, except the ones it has again",
          )}
          onClick={() => restore(restorable)}
        >
          {t("Restore {{count}} Files", { count: `${restorable.length}` })}
        </ActionButton>
      ) : null;
    },
    [t, busy, restore],
  );

  return (
    <FilesTable
      tableId="bannerlord-verify-files-archive"
      label={t("Archived files")}
      rows={rows}
      getId={getRowId}
      getColumns={getTableColumns}
      groupBy={[
        { columnId: "folder", label: t("Folder") },
        { columnId: "restore", label: t("On Restore") },
      ]}
      filterTitle={t("On Restore")}
      filters={filters}
      searchLabel={t("Search files")}
      matchesSearch={matchesSearch}
      rowActions={rowActions}
      folderActions={folderActions}
      toolbarStart={
        <div className="bls-verify-archive-title">
          <ActionButton variant="weak" icon="nav-back" onClick={onBack}>
            {t("Archives")}
          </ActionButton>
          <span className="bls-table-truncate">
            {archive.name ?? new Date(archive.createdAt).toLocaleString()}
          </span>
          <span className="bls-muted">
            {t("{{count}} files", { count: `${archive.files.length}` })}
          </span>
        </div>
      }
      toolbarActions={toolbarActions}
      empty={
        <div className="bls-empty bls-small">
          <h2>{t("The archive has no files")}</h2>
        </div>
      }
    />
  );
};

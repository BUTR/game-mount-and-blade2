import React, { FC, useMemo, useState } from "react";
import { util } from "@nexusmods/vortex-api";
import { formatGameVersion } from "./tableAttributes";
import { getArchivesPath, IFilesArchive } from "../archive";
import { getStoreName } from "../verify";
import { useLocalization } from "@bannerlord/core/localization/hooks";
import { Localize } from "@bannerlord/core/localization/types";
import { EmptyState } from "@bannerlord/ui/components/EmptyState";
import {
  ModernTable,
  ModernTableColumn,
  RowActions,
  TableSort,
} from "@bannerlord/ui/components/ModernTable";
import { formatSize } from "@bannerlord/ui/format";

const getArchiveId = (archive: IFilesArchive): string => archive.archivePath;

const getOriginalSize = (archive: IFilesArchive): number =>
  archive.files.reduce((total, file) => total + file.size, 0);

const openArchivesFolder = (): void => {
  util.opn(getArchivesPath()).catch(() => null);
};

const getColumns = (t: Localize): ModernTableColumn<IFilesArchive>[] => [
  {
    id: "name",
    label: t("Name"),
    width: "minmax(200px, 1fr)",
    render: (archive) =>
      archive.name !== undefined ? (
        <span className="bls-table-truncate" title={archive.name}>
          {archive.name}
        </span>
      ) : (
        <span className="bls-table-truncate bls-muted">{t("Unnamed")}</span>
      ),
    sortValue: (archive) => archive.name ?? null,
  },
  {
    id: "createdAt",
    label: t("Archived"),
    width: "minmax(160px, 0.5fr)",
    render: (archive) => (
      <span className="bls-table-truncate">
        {new Date(archive.createdAt).toLocaleString()}
      </span>
    ),
    sortValue: (archive) => archive.createdAt,
    firstDirection: "desc",
  },
  {
    id: "files",
    label: t("Files"),
    width: "96px",
    align: "end",
    render: (archive) => archive.files.length.toLocaleString(),
    sortValue: (archive) => archive.files.length,
    firstDirection: "desc",
  },
  {
    id: "size",
    label: t("Size"),
    width: "96px",
    align: "end",
    render: (archive) => formatSize(getOriginalSize(archive)),
    sortValue: getOriginalSize,
    firstDirection: "desc",
  },
  {
    id: "version",
    label: t("Game Version"),
    width: "minmax(160px, 0.4fr)",
    render: (archive) => (
      <span
        className="bls-table-truncate"
        title={t("{{store}} build {{build}}", {
          store: getStoreName(archive.store),
          build: archive.buildId,
        })}
      >
        {`${formatGameVersion(t, { buildId: archive.buildId, ...(archive.gameVersion !== undefined ? { version: archive.gameVersion } : {}) })} (${getStoreName(archive.store)})`}
      </span>
    ),
    sortValue: (archive) => archive.gameVersion ?? archive.buildId,
  },
];

export type ArchivesTableProps = {
  archives: IFilesArchive[];
  busy: boolean;
  /**
   * Shows the archive's files
   */
  onOpen: (archive: IFilesArchive) => void;
  onRestore: (archive: IFilesArchive) => void;
  onRename: (archive: IFilesArchive) => void;
  onDelete: (archive: IFilesArchive) => void;
};

/**
 * The archives the page moved files into. Clicking one shows its files, restoring puts them back where they were
 */
export const ArchivesTable: FC<ArchivesTableProps> = (props) => {
  const { archives, busy, onOpen, onRestore, onRename, onDelete } = props;

  const { localize: t } = useLocalization();
  const columns = useMemo(() => getColumns(t), [t]);
  const [sort, setSort] = useState<TableSort | null>({
    columnId: "createdAt",
    direction: "desc",
  });

  const actions = useMemo(
    () => ({
      label: t("Actions"),
      width: "68px",
      render: (archive: IFilesArchive) => {
        const restoreLabel = t("Restore the files of this archive");
        return (
          <RowActions
            primary={{
              icon: "undo",
              label: restoreLabel,
              disabled: busy,
              onSelect: () => onRestore(archive),
            }}
            menuLabel={t("More actions")}
            items={[
              { label: t("Show Files"), onSelect: () => onOpen(archive) },
              {
                label: t("Restore Files"),
                onSelect: () => onRestore(archive),
              },
              { label: t("Rename"), onSelect: () => onRename(archive) },
              { label: t("Open Folder"), onSelect: openArchivesFolder },
              {
                label: t("Delete Archive"),
                danger: true,
                onSelect: () => onDelete(archive),
              },
            ]}
          />
        );
      },
    }),
    [t, busy, onOpen, onRestore, onRename, onDelete],
  );

  if (archives.length === 0) {
    return (
      <EmptyState
        icon="archive"
        title={t("No archives yet")}
        description={t(
          "Archived files are stored in a .zip file in Vortex's game data folder and can be " +
            "restored to your game folder from here.",
        )}
      />
    );
  }

  return (
    <div className="bls-verify-table">
      <ModernTable
        label={t("Archives")}
        rows={archives}
        getId={getArchiveId}
        columns={columns}
        actions={actions}
        sort={sort}
        onSortChange={setSort}
        selectedId={null}
        onSelect={(id) => {
          const archive = archives.find(
            (candidate) => getArchiveId(candidate) === id,
          );
          if (archive !== undefined) {
            onOpen(archive);
          }
        }}
      />
    </div>
  );
};

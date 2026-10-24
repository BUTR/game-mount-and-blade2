import path from "path";
import React from "react";
import { Icon, tooltip, util } from "@nexusmods/vortex-api";
import { ModernTableColumn, RowMenu } from "../Shared/components/ModernTable";
import { isDeletable } from "../../verifyFiles/verify";
import {
  IVerifyFile,
  VerifyFileSource,
  VerifyFileStatus,
} from "../../verifyFiles/types";

type Localize = (key: string, values?: Record<string, string>) => string;

export const formatSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

/**
 * The game's version, like v1.4.8.119303, or the store's build when it isn't known
 */
export const formatGameVersion = (
  t: Localize,
  build: { buildId: string; version?: string },
): string => build.version ?? t("build {{build}}", { build: build.buildId });

export const getStatusLabel = (t: Localize, status: VerifyFileStatus): string =>
  ({
    extra: t("Extra"),
    changed: t("Changed"),
    missing: t("Missing"),
  })[status];

export const getSourceLabel = (t: Localize, file: IVerifyFile): string =>
  file.source === "vortex" && file.modName !== undefined
    ? file.modName
    : (
        {
          vortex: t("Vortex"),
          vortexInternal: t("Vortex"),
          store: t("GOG"),
          game: t("The game"),
          unknown: t("Unknown"),
        } satisfies Record<VerifyFileSource, string>
      )[file.source];

const getStatusTooltip = (t: Localize, file: IVerifyFile): string => {
  switch (file.status) {
    case "extra":
      return file.source === "unknown"
        ? t("Not part of the game and not deployed by Vortex")
        : t("Not part of the game");
    case "changed":
      return t("{{size}} instead of {{expected}}", {
        size: formatSize(file.size ?? 0),
        expected: formatSize(file.expectedSize ?? 0),
      });
    case "missing":
      return t("A file of the game that isn't in the game folder");
  }
};

export const getVerifyFileId = (file: IVerifyFile): string =>
  `${file.status}:${file.path}`;

// A path relative to its folder, for a row under its folder's group
export const pathInFolder = (file: { path: string; folder: string }): string =>
  file.folder !== "" ? file.path.slice(file.folder.length + 1) : file.path;

/**
 * Opens a folder of the game, never a file, opening it would run it. The game folder for a folder that's missing,
 * like a missing file's
 */
export const openGameFolder = (gamePath: string, folder: string): void => {
  util
    .opn(path.join(gamePath, folder))
    .catch(() => util.opn(gamePath))
    .catch(() => null);
};

/**
 * @param groupedByFolder Rows are under their folder's group, which already shows the folder
 */
export const getVerifyFileColumns = (
  t: Localize,
  groupedByFolder: boolean,
  onShowMod: (modId: string) => void,
): ModernTableColumn<IVerifyFile>[] => [
  {
    id: "path",
    label: t("File"),
    width: "minmax(320px, 1fr)",
    render: (file) => (
      <span className="bls-table-truncate" title={file.path}>
        {groupedByFolder ? pathInFolder(file) : file.path}
      </span>
    ),
    sortValue: (file) => file.path,
  },
  {
    id: "folder",
    label: t("Folder"),
    width: "minmax(160px, 0.4fr)",
    render: (file) => (
      <span className="bls-table-truncate" title={file.folder}>
        {file.folder}
      </span>
    ),
    sortValue: (file) => file.folder,
    groupValue: (file) => file.folder,
    toggleable: true,
  },
  {
    id: "status",
    label: t("Status"),
    width: "120px",
    render: (file) => (
      <span className="bls-status">
        {file.source === "unknown" ? (
          <tooltip.Icon
            name="feedback-warning"
            className="bls-warning"
            tooltip={getStatusTooltip(t, file)}
          />
        ) : (
          <tooltip.Icon
            name="feedback-info"
            className="bls-muted"
            tooltip={getStatusTooltip(t, file)}
          />
        )}
        <span className="bls-status-label">
          {getStatusLabel(t, file.status)}
        </span>
      </span>
    ),
    sortValue: (file) => file.status,
    groupValue: (file) => getStatusLabel(t, file.status),
  },
  {
    id: "source",
    label: t("Source"),
    width: "minmax(140px, 0.4fr)",
    render: (file) => {
      const label = getSourceLabel(t, file);
      const modId = file.modId;
      if (modId === undefined) {
        return (
          <span className="bls-table-truncate" title={label}>
            {label}
          </span>
        );
      }
      return (
        <button
          type="button"
          className="bls-link-button bls-verify-mod-link"
          title={t("Show {{mod}} in Mods", { mod: label })}
          onClick={(event) => {
            event.stopPropagation();
            onShowMod(modId);
          }}
        >
          {label}
        </button>
      );
    },
    sortValue: (file) => getSourceLabel(t, file),
    groupValue: (file) => getSourceLabel(t, file),
    toggleable: true,
  },
  {
    id: "size",
    label: t("Size"),
    width: "96px",
    align: "end",
    // A missing file's size is unknown when the store doesn't tell it
    render: (file) => (file.size !== undefined ? formatSize(file.size) : ""),
    sortValue: (file) => file.size ?? null,
    firstDirection: "desc",
    toggleable: true,
  },
];

/**
 * Moving files the list shows into an archive, or deleting them
 */
export type RemoveFilesActions = {
  onArchive: (files: IVerifyFile[]) => void;
  onDelete: (files: IVerifyFile[]) => void;
};

/**
 * Opening the file's folder on row hover, showing its mod, archiving and deleting it from the menu
 */
export const getVerifyFileActions = (
  t: Localize,
  gamePath: string,
  onShowMod: (modId: string) => void,
  { onArchive, onDelete }: RemoveFilesActions,
) => ({
  label: t("Actions"),
  width: "68px",
  render: (file: IVerifyFile) => {
    const openFolder = (): void =>
      openGameFolder(gamePath, path.dirname(file.path));
    const openLabel = t("Open the folder of {{file}}", { file: file.path });
    const modId = file.modId;
    return (
      <>
        <button
          type="button"
          className="bls-btn bls-btn-weak bls-btn-icon bls-row-hover-only"
          aria-label={openLabel}
          title={openLabel}
          onClick={(event) => {
            event.stopPropagation();
            openFolder();
          }}
        >
          <Icon name="open-ext" />
        </button>
        <RowMenu
          label={t("More actions")}
          items={[
            { label: t("Open Folder"), onSelect: openFolder },
            ...(modId !== undefined
              ? [{ label: t("Show in Mods"), onSelect: () => onShowMod(modId) }]
              : []),
            ...(isDeletable(file)
              ? [
                  {
                    label: t("Move to Archive"),
                    onSelect: () => onArchive([file]),
                  },
                  {
                    label: t("Delete File"),
                    danger: true,
                    onSelect: () => onDelete([file]),
                  },
                ]
              : []),
          ]}
        />
      </>
    );
  },
});

/**
 * A folder group's buttons: opening the folder on hover, archiving and deleting the files the list shows in it from
 * the menu
 */
export const getFolderActions = (
  t: Localize,
  gamePath: string,
  { onArchive, onDelete }: RemoveFilesActions,
) => {
  const FolderActions = (folder: string, shown: IVerifyFile[]): JSX.Element => {
    const openFolder = (): void => openGameFolder(gamePath, folder);
    const openLabel = t("Open {{folder}}", {
      folder: folder !== "" ? folder : t("Game folder"),
    });
    const deletable = shown.filter(isDeletable);
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
            ...(deletable.length > 0
              ? [
                  {
                    label: t("Archive {{count}} Shown Files", {
                      count: `${deletable.length}`,
                    }),
                    onSelect: () => onArchive(deletable),
                  },
                  {
                    label: t("Delete {{count}} Shown Files", {
                      count: `${deletable.length}`,
                    }),
                    danger: true,
                    onSelect: () => onDelete(deletable),
                  },
                ]
              : []),
          ]}
        />
      </>
    );
  };
  return FolderActions;
};

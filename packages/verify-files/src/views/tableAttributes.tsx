import path from "path";
import React from "react";
import { tooltip, util } from "@nexusmods/vortex-api";
import { Localize } from "@bannerlord/core/localization/types";
import {
  ModernTableColumn,
  RowActions,
} from "@bannerlord/ui/components/ModernTable";
import { formatSize } from "@bannerlord/ui/format";
import { getFolder, isDeletable } from "../verify";
import {
  IVerifyFile,
  IVerifyPackage,
  VerifyFileSource,
  VerifyFileStatus,
} from "../types";

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

export const getSourceLabel = (
  t: Localize,
  file: IVerifyFile,
  storeName: string,
): string =>
  (file.source === "vortex" || file.source === "manualMod") &&
  file.modName !== undefined
    ? file.modName
    : (
        {
          vortex: t("Vortex"),
          vortexInternal: t("Vortex"),
          store: storeName,
          game: t("The game"),
          manualMod: t("A mod"),
          unknown: t("Unknown"),
        } satisfies Record<VerifyFileSource, string>
      )[file.source];

const getStatusTooltip = (t: Localize, file: IVerifyFile): string => {
  switch (file.status) {
    case "extra":
      return file.source === "manualMod"
        ? t(
            "A mod copied into the game folder by hand, not installed by Vortex",
          )
        : file.source === "unknown"
          ? t("Not part of the game and not deployed by Vortex")
          : t("Not part of the game");
    case "changed":
      // Found by Xbox's mark of unmodified files
      return file.size === file.expectedSize
        ? t(
            "Changed since the store installed it, or copied back, its size is the same",
          )
        : t("{{size}} instead of {{expected}}", {
            size: formatSize(file.size ?? 0),
            expected: formatSize(file.expectedSize ?? 0),
          });
    case "missing":
      return t("A file of the game that isn't in the game folder");
  }
};

export const getVerifyFileId = (file: IVerifyFile): string =>
  `${file.status}:${file.package?.name ?? ""}:${file.path}`;

// A path relative to its folder, for a row under its folder's group. A package's folder starts with its name
export const pathInFolder = (file: {
  path: string;
  folder: string;
  package?: IVerifyPackage;
}): string => {
  const folder =
    file.package !== undefined ? getFolder(file.path) : file.folder;
  return folder !== "" ? file.path.slice(folder.length + 1) : file.path;
};

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
  storeName: string,
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
        {file.source === "unknown" || file.source === "manualMod" ? (
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
      const label = getSourceLabel(t, file, storeName);
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
    sortValue: (file) => getSourceLabel(t, file, storeName),
    groupValue: (file) => getSourceLabel(t, file, storeName),
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
      openGameFolder(file.package?.path ?? gamePath, path.dirname(file.path));
    const openLabel = t("Open the folder of {{file}}", { file: file.path });
    const modId = file.modId;
    return (
      <RowActions
        primary={{ icon: "open-ext", label: openLabel, onSelect: openFolder }}
        menuLabel={t("More actions")}
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
    // A package's group is its folder in the package's own folder
    const filePackage = shown[0]?.package;
    const openFolder = (): void =>
      filePackage !== undefined
        ? openGameFolder(filePackage.path, getFolder(shown[0]!.path))
        : openGameFolder(gamePath, folder);
    const openLabel = t("Open {{folder}}", {
      folder: folder !== "" ? folder : t("Game folder"),
    });
    const deletable = shown.filter(isDeletable);
    return (
      <RowActions
        primary={{ icon: "open-ext", label: openLabel, onSelect: openFolder }}
        menuLabel={t("More actions")}
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
    );
  };
  return FolderActions;
};

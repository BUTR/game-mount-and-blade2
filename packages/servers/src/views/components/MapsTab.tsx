import React, { FC, useEffect, useMemo, useState } from "react";
import { util } from "@nexusmods/vortex-api";
import { getFolderSizeAsync, ILocalScene } from "@bannerlord/server-maps";
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

interface IMapRow {
  scene: ILocalScene;
  size: number | null;
}

const NO_SCENES: ILocalScene[] = [];

export type MapsTabProps = {
  /**
   * Null while the game folder is being read
   */
  scenes: ILocalScene[] | null;
  folder: string | null;
  onRemove: (scene: ILocalScene) => Promise<void>;
};

/**
 * Revisions represent the Unix timestamp (in milliseconds) when the map was saved in the editor.
 */
const formatRevision = (revision: string | null): string => {
  if (revision === null) {
    return "";
  }
  const time = Number(revision);
  return Number.isFinite(time) && time > 0
    ? new Date(time).toLocaleString()
    : revision;
};

const getMapId = (row: IMapRow): string => row.scene.path;

const getColumns = (t: Localize): ModernTableColumn<IMapRow>[] => [
  {
    id: "name",
    label: t("Map"),
    width: "minmax(240px, 1fr)",
    render: (row) => (
      <span className="bls-table-truncate bls-map-name" title={row.scene.name}>
        {row.scene.name}
      </span>
    ),
    sortValue: (row) => row.scene.name,
  },
  {
    id: "revision",
    label: t("Saved"),
    width: "180px",
    render: (row) => formatRevision(row.scene.revision),
    sortValue: (row) => {
      const time = Number(row.scene.revision);
      return Number.isFinite(time) && time > 0 ? time : null;
    },
    firstDirection: "desc",
  },
  {
    id: "size",
    label: t("Size"),
    width: "96px",
    align: "end",
    render: (row) => (row.size !== null ? formatSize(row.size) : ""),
    sortValue: (row) => row.size,
    firstDirection: "desc",
  },
];

/**
 * Quick action to open the folder on row hover (matching the Mods table pattern), with secondary actions in the context menu.
 */
const getRowActions = (
  t: Localize,
  onRemove: (scene: ILocalScene) => Promise<void>,
) => ({
  label: t("Actions"),
  width: "68px",
  render: (row: IMapRow) => {
    const openFolder = (): void => {
      util.opn(row.scene.path).catch(() => null);
    };
    const openLabel = t("Open the folder of {{map}}", { map: row.scene.name });
    return (
      <RowActions
        primary={{ icon: "open-ext", label: openLabel, onSelect: openFolder }}
        menuLabel={t("More actions")}
        items={[
          { label: t("Open Folder"), onSelect: openFolder },
          {
            label: t("Remove Map"),
            danger: true,
            onSelect: () => void onRemove(row.scene),
          },
        ]}
      />
    );
  },
});

export const MapsTab: FC<MapsTabProps> = (props) => {
  const { folder, onRemove } = props;
  const loading = props.scenes === null;
  const scenes = props.scenes ?? NO_SCENES;

  const { localize: t } = useLocalization();

  const [sizes, setSizes] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      scenes.map(
        async (scene) =>
          [scene.path, await getFolderSizeAsync(scene.path)] as const,
      ),
    ).then((entries) => {
      if (!cancelled) {
        setSizes(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scenes]);

  const rows = useMemo(
    () => scenes.map((scene) => ({ scene, size: sizes[scene.path] ?? null })),
    [scenes, sizes],
  );
  const columns = useMemo(() => getColumns(t), [t]);
  const rowActions = useMemo(() => getRowActions(t, onRemove), [t, onRemove]);
  const [sort, setSort] = useState<TableSort | null>({
    columnId: "name",
    direction: "asc",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totalSize = scenes.every((scene) => sizes[scene.path] !== undefined)
    ? formatSize(
        scenes.reduce((total, scene) => total + (sizes[scene.path] ?? 0), 0),
      )
    : "…";
  const folderText = folder ?? "Modules\\Multiplayer\\SceneObj";

  if (loading) {
    return (
      <EmptyState
        icon="spinner"
        status
        title={t("Looking for downloaded maps...")}
        description={t("Reading {{folder}}.", { folder: folderText })}
      />
    );
  }

  if (scenes.length === 0) {
    return (
      <EmptyState
        icon="download"
        title={t("No downloaded maps yet")}
        description={t(
          "Custom maps you download from a server, in Vortex or in the game, show up here. " +
            "They are kept in {{folder}}.",
          { folder: folderText },
        )}
      />
    );
  }

  return (
    <>
      <div className="bls-summary bls-small">
        <div className="bls-summary-card">
          <span className="bls-title-xs">{t("Downloaded Maps")}</span>
          <span className="bls-summary-value">{scenes.length}</span>
        </div>
        <div className="bls-summary-card">
          <span className="bls-title-xs">{t("On Disk")}</span>
          <span className="bls-summary-value">{totalSize}</span>
        </div>
      </div>
      <p className="bls-small bls-muted" style={{ margin: 0 }}>
        {t(
          "Custom maps downloaded from dedicated servers via Vortex or the in-game downloader. " +
            "Removing a map is safe; servers running it will prompt to re-download. " +
            "The 'Saved' column displays the timestamp when the author last saved the map.",
        )}
      </p>
      <div className="bls-maps-table">
        <ModernTable
          label={t("Downloaded maps")}
          rows={rows}
          getId={getMapId}
          columns={columns}
          actions={rowActions}
          sort={sort}
          onSortChange={setSort}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </>
  );
};

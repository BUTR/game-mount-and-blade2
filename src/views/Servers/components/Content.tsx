import React, { FC, ReactNode, useMemo } from "react";
import {
  Sidebar,
  SidebarActions,
  SidebarCollection,
  SidebarJoin,
  SidebarMaps,
  SidebarMods,
} from "./Sidebar";
import { IServerRow } from "../../../servers/row";
import { IModuleCache } from "../../../types";
import { useLocalization } from "../../../localization/hooks";
import {
  ModernTable,
  ModernTableColumn,
  TableGrouping,
  TableSort,
} from "../../Shared/components/ModernTable";

export type ContentProps = {
  rows: Record<string, IServerRow>;
  /**
   * Ids of the columns Display options hides
   */
  hiddenColumns: readonly string[];
  columns: ModernTableColumn<IServerRow>[];
  rowActions: {
    label: string;
    width: string;
    render: (row: IServerRow) => JSX.Element;
  };
  sort: TableSort | null;
  onSortChange: (sort: TableSort) => void;
  grouping: TableGrouping | null;
  selectedRow: IServerRow | null;
  rowSelected: (serverId: string | null) => void;
  /**
   * Rendered in place of the table when search and filter criteria yield no matching servers.
   */
  noMatches: ReactNode;
  installedModules: Readonly<IModuleCache> | null;
  collection: SidebarCollection;
  mods: SidebarMods;
  maps: SidebarMaps;
  actions: SidebarActions;
  join: SidebarJoin;
};

const getRowId = (row: IServerRow): string => row.id;
// Pinned servers (such as the server for the active profile) remain at the top regardless of sort order.
const isPinned = (row: IServerRow): boolean => row.pinned;
const getRowClass = (row: IServerRow): string | undefined =>
  row.pinned ? "server-profile-row" : undefined;

export const Content: FC<ContentProps> = (props) => {
  const {
    rows,
    columns,
    hiddenColumns,
    rowActions,
    sort,
    onSortChange,
    grouping,
    selectedRow,
    rowSelected,
    noMatches,
    installedModules,
    collection,
    mods,
    maps,
    actions,
    join,
  } = props;

  const { localize: t } = useLocalization();
  const rowList = useMemo(() => Object.values(rows), [rows]);

  return (
    <div className="bls-split">
      <div className="bls-split-main">
        {rowList.length === 0 ? (
          noMatches
        ) : (
          <ModernTable
            label={t("Servers")}
            rows={rowList}
            getId={getRowId}
            columns={columns}
            hiddenColumns={hiddenColumns}
            actions={rowActions}
            sort={sort}
            onSortChange={onSortChange}
            grouping={grouping}
            selectedId={selectedRow?.id ?? null}
            onSelect={rowSelected}
            isPinned={isPinned}
            rowClassName={getRowClass}
          />
        )}
      </div>
      <Sidebar
        row={selectedRow}
        installedModules={installedModules}
        collection={collection}
        mods={mods}
        maps={maps}
        actions={actions}
        join={join}
      />
    </div>
  );
};

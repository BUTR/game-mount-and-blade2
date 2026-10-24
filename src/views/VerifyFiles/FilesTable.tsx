import React, {
  ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalization } from "../../localization/hooks";
import {
  DisplayOptionsPopover,
  FilterCheckbox,
  FilterGroup,
  FilterPopover,
  PopoverGroup,
  PopoverPicker,
  TableToolbar,
  ToolbarSearch,
  ToolbarViews,
} from "../Shared/components/TableToolbar";
import {
  ColumnToggles,
  useColumnVisibility,
} from "../Shared/components/ColumnToggles";
import { NoMatches } from "../Shared/components/NoMatches";
import {
  createTableGrouping,
  ModernTable,
  ModernTableColumn,
  TableGrouping,
  TableSort,
} from "../Shared/components/ModernTable";

// A folder with more files starts collapsed, a module copied in by hand is one row until it's opened
const COLLAPSED_FOLDER_SIZE = 10;
const FOLDER_COLUMN = "folder";

/**
 * A file listed under its folder, a module or the folder it's in
 */
export type FilesTableRow = {
  path: string;
  folder: string;
};

export type FilesTableFilter<T> = {
  id: string;
  label: string;
  matches: (row: T) => boolean;
};

export type FilesTableProps<T extends FilesTableRow> = {
  /**
   * Where Vortex keeps the columns the user hid
   */
  tableId: string;
  label: string;
  rows: readonly T[];
  getId: (row: T) => string;
  /**
   * @param groupedByFolder The rows are under their folder's group, which already shows the folder
   */
  getColumns: (groupedByFolder: boolean) => ModernTableColumn<T>[];
  /**
   * The columns the rows can be grouped by, the folder column first, the default
   */
  groupBy: { columnId: string; label: string }[];
  filterTitle: string;
  filters: FilesTableFilter<T>[];
  searchLabel: string;
  matchesSearch: (row: T, needle: string) => boolean;
  rowActions?: {
    label: string;
    width: string;
    render: (row: T) => ReactNode;
  };
  /**
   * A folder group's buttons, for the rows the search and filters leave in it
   */
  folderActions?: (folder: string, shown: T[]) => ReactNode;
  /**
   * Left of the toolbar, like the views or the way back
   */
  toolbarStart: ReactNode;
  /**
   * Buttons for the rows the search and filters leave
   */
  toolbarActions?: (shown: T[]) => ReactNode;
  /**
   * Shown instead of the table when there are no rows before searching and filtering
   */
  empty: ReactNode;
};

/**
 * A table of files with a toolbar: the files grouped by folder or listed, searched, filtered, the columns chosen,
 * with actions for a file, a folder and every file shown
 */
export const FilesTable = <T extends FilesTableRow>(
  props: FilesTableProps<T>,
): JSX.Element => {
  const {
    tableId,
    label,
    rows,
    getId,
    getColumns,
    groupBy: groupByOptions,
    filterTitle,
    filters,
    searchLabel,
    matchesSearch,
    rowActions,
    folderActions,
    toolbarStart,
    toolbarActions,
    empty,
  } = props;

  const { localize: t } = useLocalization();

  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<TableSort | null>({
    columnId: "path",
    direction: "asc",
  });
  const [groupBy, setGroupBy] = useState<string | null>(FOLDER_COLUMN);
  // What Grouped goes back to after List
  const lastGroupBy = useRef(FOLDER_COLUMN);
  const changeGroupBy = useCallback((next: string | null): void => {
    if (next !== null) {
      lastGroupBy.current = next;
    }
    setGroupBy(next);
  }, []);
  // The collapsed groups of the columns other than the folder's
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, string[]>
  >({});
  // The folders opened or closed against their default, which survives the rows changing
  const [toggledFolders, setToggledFolders] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const active = filters.filter((filter) =>
      activeFilters.includes(filter.id),
    );
    return rows.filter(
      (row) =>
        (active.length === 0 || active.some((filter) => filter.matches(row))) &&
        (needle === "" || matchesSearch(row, needle)),
    );
  }, [rows, filters, activeFilters, search, matchesSearch]);

  const groupedByFolder = groupBy === FOLDER_COLUMN;
  const columns = useMemo(
    () => getColumns(groupedByFolder),
    [getColumns, groupedByFolder],
  );
  // Kept in Vortex's table settings, so the columns a user hid stay hidden
  const columnVisibility = useColumnVisibility(tableId, columns);
  // The folder group shows the folder, its column would repeat it on every row
  const hiddenColumns = useMemo(
    () =>
      groupedByFolder
        ? [...columnVisibility.hiddenColumns, FOLDER_COLUMN]
        : columnVisibility.hiddenColumns,
    [groupedByFolder, columnVisibility.hiddenColumns],
  );

  const shownByFolder = useMemo(() => {
    const byFolder = new Map<string, T[]>();
    for (const row of shown) {
      const folder = byFolder.get(row.folder);
      if (folder !== undefined) {
        folder.push(row);
      } else {
        byFolder.set(row.folder, [row]);
      }
    }
    return byFolder;
  }, [shown]);

  const grouping = useMemo((): TableGrouping | null => {
    if (groupBy === null) {
      return null;
    }
    if (groupBy !== FOLDER_COLUMN) {
      return createTableGrouping(
        groupBy,
        t("None"),
        collapsedGroups,
        setCollapsedGroups,
      );
    }
    const sizes = new Map<string, number>();
    for (const row of rows) {
      sizes.set(row.folder, (sizes.get(row.folder) ?? 0) + 1);
    }
    return {
      columnId: FOLDER_COLUMN,
      emptyLabel: t("Game folder"),
      collapsed: [...sizes]
        .filter(
          ([folder, size]) =>
            size > COLLAPSED_FOLDER_SIZE !== toggledFolders.has(folder),
        )
        .map(([folder]) => folder),
      onToggle: (folder) =>
        setToggledFolders((previous) => {
          const next = new Set(previous);
          if (!next.delete(folder)) {
            next.add(folder);
          }
          return next;
        }),
      ...(folderActions !== undefined
        ? {
            actions: (folder: string) =>
              folderActions(folder, shownByFolder.get(folder) ?? []),
          }
        : {}),
    };
  }, [
    groupBy,
    rows,
    collapsedGroups,
    toggledFolders,
    folderActions,
    shownByFolder,
    t,
  ]);

  const renderTable = (): ReactNode => {
    if (shown.length > 0) {
      return (
        <div className="bls-verify-table">
          <ModernTable
            label={label}
            rows={shown}
            getId={getId}
            columns={columns}
            hiddenColumns={hiddenColumns}
            {...(rowActions !== undefined ? { actions: rowActions } : {})}
            sort={sort}
            onSortChange={setSort}
            grouping={grouping}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      );
    }
    if (search !== "" || activeFilters.length > 0) {
      return (
        <NoMatches
          title={t("No files match your search and filters")}
          resetLabel={t("Clear Search and Filters")}
          onReset={() => {
            setSearch("");
            setActiveFilters([]);
          }}
        />
      );
    }
    return empty;
  };

  return (
    <>
      <TableToolbar start={toolbarStart}>
        {toolbarActions?.(shown)}
        <ToolbarViews
          label={t("Layout")}
          views={[
            { id: "grouped", label: t("Grouped") },
            { id: "list", label: t("List") },
          ]}
          selected={groupBy !== null ? "grouped" : "list"}
          onSelect={(id) =>
            changeGroupBy(id === "list" ? null : lastGroupBy.current)
          }
        />
        <ToolbarSearch
          label={searchLabel}
          value={search}
          onChange={setSearch}
        />
        <FilterPopover
          label={t("Filters")}
          activeCount={activeFilters.length}
          resetLabel={t("Reset filters")}
          onReset={() => setActiveFilters([])}
        >
          <FilterGroup title={filterTitle}>
            {filters.map((filter) => (
              <FilterCheckbox
                key={filter.id}
                label={filter.label}
                count={rows.filter(filter.matches).length}
                checked={activeFilters.includes(filter.id)}
                onChange={(checked) =>
                  setActiveFilters(
                    checked
                      ? [...activeFilters, filter.id]
                      : activeFilters.filter((other) => other !== filter.id),
                  )
                }
              />
            ))}
          </FilterGroup>
        </FilterPopover>
        <DisplayOptionsPopover
          label={t("Display options")}
          canReset={groupBy !== FOLDER_COLUMN || columnVisibility.canReset}
          resetLabel={t("Reset to default")}
          onReset={() => {
            changeGroupBy(FOLDER_COLUMN);
            columnVisibility.reset();
          }}
        >
          <PopoverGroup>
            <PopoverPicker
              label={t("Group by")}
              options={[
                { value: null, label: t("None") },
                ...groupByOptions.map((option) => ({
                  value: option.columnId as string | null,
                  label: option.label,
                })),
              ]}
              value={groupBy}
              onChange={changeGroupBy}
            />
          </PopoverGroup>
          <ColumnToggles
            title={t("Toggle columns")}
            toggles={columnVisibility.toggles}
            onToggle={columnVisibility.setVisible}
          />
        </DisplayOptionsPopover>
      </TableToolbar>
      {renderTable()}
    </>
  );
};

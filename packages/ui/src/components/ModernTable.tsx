import React, {
  CSSProperties,
  Dispatch,
  FC,
  Fragment,
  KeyboardEvent,
  ReactNode,
  SetStateAction,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "@nexusmods/vortex-api";

// mdiArrowDown, mdiArrowUp, mdiChevronDown, mdiChevronRight and mdiDotsHorizontal from Material Design Icons
// (@mdi/js, Apache 2.0), the icons the Modern UI table uses; Vortex's own icon set has other ones
const ARROW_DOWN_PATH =
  "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z";
const ARROW_UP_PATH =
  "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z";
const CHEVRON_DOWN_PATH =
  "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";
const CHEVRON_RIGHT_PATH =
  "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z";
const DOTS_PATH =
  "M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12" +
  "M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12" +
  "M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z";

export const PathIcon: FC<{ path: string; className?: string }> = ({
  path,
  className,
}) => (
  <svg
    className={["bls-path-icon", className].filter(Boolean).join(" ")}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
);

export type SortDirection = "asc" | "desc";

export type TableSort = {
  columnId: string;
  direction: SortDirection;
};

export type ModernTableColumn<T> = {
  id: string;
  label: string;
  /**
   * CSS grid track sizing (e.g., 'minmax(240px, 1fr)' for the flexible column).
   */
  width: string;
  render: (row: T) => ReactNode;
  /**
   * Value extractor enabling column sorting via header click. Null values sort last in either direction.
   */
  sortValue?: (row: T) => string | number | null;
  /**
   * Initial sort direction on first click (descending is typically preferred for numeric metrics).
   */
  firstDirection?: SortDirection;
  /**
   * Restricts the header label to screen readers only (useful for icon columns).
   */
  hideLabel?: boolean;
  align?: "end";
  /**
   * Value extractor enabling grouping by this column. Rows with a null or empty value share one group.
   */
  groupValue?: (row: T) => string | null;
  /**
   * Order of the groups while the table isn't sorted by this column (ascending by default).
   */
  groupDirection?: SortDirection;
  /**
   * Whether Display options can hide the column, see `hiddenColumns`.
   */
  toggleable?: boolean;
};

/**
 * A group's picture and color (the Modern UI's group images): the picture goes before the group's name, and the
 * color washes the group's row and tints the rows under it.
 */
export type TableGroupDecoration = {
  image?: ReactNode;
  color?: string | null;
};

export type TableGrouping = {
  /**
   * Column whose `groupValue` the rows are grouped by.
   */
  columnId: string;
  /**
   * Header label for the group of rows without a value.
   */
  emptyLabel: string;
  /**
   * Values of the groups whose rows are hidden.
   */
  collapsed: readonly string[];
  onToggle: (value: string) => void;
  /**
   * The picture and color of the group with a value, if it has any.
   */
  decorate?: (value: string) => TableGroupDecoration | undefined;
  /**
   * Buttons at the end of the group's row, for the group's rows.
   */
  actions?: (value: string) => ReactNode;
};

/**
 * Grouping by a column, keeping the collapsed groups of every column in one state so each grouping remembers its own.
 */
export const createTableGrouping = (
  columnId: string,
  emptyLabel: string,
  collapsedGroups: Readonly<Record<string, string[]>>,
  setCollapsedGroups: Dispatch<SetStateAction<Record<string, string[]>>>,
): TableGrouping => ({
  columnId,
  emptyLabel,
  collapsed: collapsedGroups[columnId] ?? [],
  onToggle: (value) =>
    setCollapsedGroups((previous) => {
      const collapsed = previous[columnId] ?? [];
      return {
        ...previous,
        [columnId]: collapsed.includes(value)
          ? collapsed.filter((other) => other !== value)
          : [...collapsed, value],
      };
    }),
});

export type ModernTableProps<T> = {
  label: string;
  rows: T[];
  getId: (row: T) => string;
  columns: ModernTableColumn<T>[];
  /**
   * Ids of the columns not shown. The rows can still be sorted and grouped by them.
   */
  hiddenColumns?: readonly string[];
  sort: TableSort | null;
  onSortChange: (sort: TableSort) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Predicate identifying pinned rows that remain at the top regardless of sort order.
   */
  isPinned?: (row: T) => boolean;
  rowClassName?: (row: T) => string | undefined;
  /**
   * Groups rows under collapsible headers, ordered by value in the grouped column's sort direction when the table is
   * sorted by it, in its `groupDirection` otherwise. Pinned rows stay above the groups.
   */
  grouping?: TableGrouping | null;
  /**
   * Configuration for the actions column pinned to the right edge of the table.
   */
  actions?: {
    label: string;
    width: string;
    render: (row: T) => ReactNode;
  };
};

const compareValues = (
  lhs: string | number | null,
  rhs: string | number | null,
): number => {
  if (lhs === rhs) {
    return 0;
  }
  if (lhs === null) {
    return 1;
  }
  if (rhs === null) {
    return -1;
  }
  return typeof lhs === "number" && typeof rhs === "number"
    ? lhs - rhs
    : String(lhs).localeCompare(String(rhs), undefined, {
        numeric: true,
        sensitivity: "base",
      });
};

// A group's color for its rows' styles, see .bls-table-group and .bls-table-row in modern.scss
const groupColorProps = (
  color: string | null | undefined,
): { "data-group-color"?: ""; style?: CSSProperties } =>
  color != null
    ? {
        "data-group-color": "",
        style: { "--bls-group-color": color } as CSSProperties,
      }
    : {};

/**
 * Modern UI data table component tailored for the extension without depending on Vortex's internal components.
 * Implemented as a CSS grid with subgrid rows, sticky header, directional sort indicators,
 * and a right-pinned actions column. Styled via modern.scss.
 */
export const ModernTable = <T,>(props: ModernTableProps<T>): JSX.Element => {
  const {
    label,
    rows,
    getId,
    columns,
    hiddenColumns,
    sort,
    onSortChange,
    selectedId,
    onSelect,
    isPinned,
    rowClassName,
    grouping,
    actions,
  } = props;

  const sorted = useMemo(() => {
    const column =
      sort !== null
        ? columns.find((candidate) => candidate.id === sort.columnId)
        : undefined;
    const value = column?.sortValue;
    const sign = sort?.direction === "desc" ? -1 : 1;
    return [...rows].sort((lhs, rhs) => {
      const pinned =
        Number(isPinned?.(rhs) ?? false) - Number(isPinned?.(lhs) ?? false);
      if (pinned !== 0) {
        return pinned;
      }
      if (value === undefined) {
        return 0;
      }
      const lhsValue = value(lhs);
      const rhsValue = value(rhs);
      // Null / empty values sort to the end regardless of sort direction.
      if (lhsValue === null || rhsValue === null) {
        return compareValues(lhsValue, rhsValue);
      }
      return sign * compareValues(lhsValue, rhsValue);
    });
  }, [rows, columns, sort, isPinned]);

  // Sections of rows in display order. The section without a value holds every row, or the pinned rows when grouped
  const groupColumn =
    grouping != null
      ? columns.find((candidate) => candidate.id === grouping.columnId)
      : undefined;
  const groupColumnId = groupColumn?.id;
  const groupValue = groupColumn?.groupValue;
  const groupDirection =
    sort !== null && sort.columnId === groupColumnId
      ? sort.direction
      : (groupColumn?.groupDirection ?? "asc");
  const sections = useMemo((): { value: string | null; rows: T[] }[] => {
    if (groupValue === undefined) {
      return [{ value: null, rows: sorted }];
    }
    const pinned: T[] = [];
    const groups = new Map<string, T[]>();
    for (const row of sorted) {
      if (isPinned?.(row) === true) {
        pinned.push(row);
        continue;
      }
      const value = groupValue(row) ?? "";
      const group = groups.get(value);
      if (group !== undefined) {
        group.push(row);
      } else {
        groups.set(value, [row]);
      }
    }
    const sign = groupDirection === "desc" ? -1 : 1;
    return [
      ...(pinned.length > 0 ? [{ value: null, rows: pinned }] : []),
      ...[...groups.keys()]
        // The group without a value goes last in either direction
        .sort((lhs, rhs) =>
          lhs === "" || rhs === ""
            ? compareValues(lhs || null, rhs || null)
            : sign * compareValues(lhs, rhs),
        )
        .map((value) => ({ value, rows: groups.get(value)! })),
    ];
  }, [sorted, groupValue, groupDirection, isPinned]);

  const isCollapsed = (value: string | null): boolean =>
    value !== null && grouping?.collapsed.includes(value) === true;
  // The rows outside collapsed groups, the ones keyboard navigation moves through
  const visible = sections.flatMap((section) =>
    isCollapsed(section.value) ? [] : section.rows,
  );

  const shownColumns = useMemo(
    () =>
      hiddenColumns === undefined || hiddenColumns.length === 0
        ? columns
        : columns.filter((column) => !hiddenColumns.includes(column.id)),
    [columns, hiddenColumns],
  );

  const template = [
    "var(--bls-table-gutter-start)",
    ...shownColumns.map((column) => column.width),
    ...(actions !== undefined ? [actions.width] : []),
    "var(--bls-table-gutter-end)",
  ].join(" ");

  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  // The selected row (or first row as fallback) serves as the initial tab stop for keyboard navigation.
  const focusId =
    selectedId !== null && visible.some((row) => getId(row) === selectedId)
      ? selectedId
      : visible[0] !== undefined
        ? getId(visible[0])
        : null;

  // Stores pending row ID navigated via arrow keys to apply focus once selection updates.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current !== null && pendingFocus.current === selectedId) {
      rowRefs.current.get(selectedId)?.focus();
      pendingFocus.current = null;
    }
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (visible.length === 0 || event.target !== event.currentTarget) {
      return;
    }
    const index = visible.findIndex((row) => getId(row) === focusId);
    const next =
      event.key === "ArrowDown"
        ? Math.min(index + 1, visible.length - 1)
        : event.key === "ArrowUp"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? visible.length - 1
              : null;
    if (next === null) {
      return;
    }
    event.preventDefault();
    const nextId = getId(visible[next]!);
    pendingFocus.current = nextId;
    onSelect(nextId);
  };

  const onSort = (column: ModernTableColumn<T>): void => {
    onSortChange(
      sort?.columnId === column.id
        ? {
            columnId: column.id,
            direction: sort.direction === "asc" ? "desc" : "asc",
          }
        : { columnId: column.id, direction: column.firstDirection ?? "asc" },
    );
  };

  // Level 2 for a row under a group, as a tree grid has it, tinted in the group's color if it has one
  const renderRow = (
    row: T,
    level?: number,
    color?: string | null,
  ): JSX.Element => {
    const id = getId(row);
    const selected = id === selectedId;
    return (
      <div
        key={id}
        {...groupColorProps(color)}
        ref={(element) => {
          if (element !== null) {
            rowRefs.current.set(id, element);
          } else {
            rowRefs.current.delete(id);
          }
        }}
        className={["bls-table-row", rowClassName?.(row)]
          .filter(Boolean)
          .join(" ")}
        role="row"
        aria-selected={selected}
        aria-level={level}
        tabIndex={id === focusId ? 0 : -1}
        onClick={() => onSelect(id)}
        onKeyDown={onKeyDown}
      >
        {shownColumns.map((column) => (
          <div
            key={column.id}
            className="bls-table-cell"
            role="gridcell"
            data-align={column.align}
            data-sorted={sort?.columnId === column.id ? "" : undefined}
          >
            {column.render(row)}
          </div>
        ))}
        {actions !== undefined && (
          <div
            className="bls-table-cell bls-table-actions-cell"
            role="gridcell"
          >
            {actions.render(row)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="bls-table"
      role="grid"
      aria-label={label}
      aria-rowcount={
        1 +
        visible.length +
        sections.filter((section) => section.value !== null).length
      }
      style={{ gridTemplateColumns: template }}
    >
      <div className="bls-table-head" role="rowgroup">
        <div className="bls-table-header" role="row">
          {shownColumns.map((column) => {
            const sortedHere = sort?.columnId === column.id;
            return (
              <div
                key={column.id}
                className="bls-table-cell"
                role="columnheader"
                data-align={column.align}
                aria-sort={
                  sortedHere
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortValue !== undefined ? (
                  <button
                    type="button"
                    className="bls-table-sort-button"
                    aria-label={column.hideLabel ? column.label : undefined}
                    title={column.hideLabel ? column.label : undefined}
                    onClick={() => onSort(column)}
                  >
                    {!column.hideLabel && (
                      <span className="bls-table-truncate">{column.label}</span>
                    )}
                    {sortedHere && (
                      <PathIcon
                        className="bls-table-sort-icon"
                        path={
                          sort.direction === "asc"
                            ? ARROW_DOWN_PATH
                            : ARROW_UP_PATH
                        }
                      />
                    )}
                  </button>
                ) : (
                  <span
                    className={
                      column.hideLabel
                        ? "bls-sr-only"
                        : "bls-table-header-label"
                    }
                  >
                    {column.label}
                  </span>
                )}
              </div>
            );
          })}
          {actions !== undefined && (
            <div
              className="bls-table-cell bls-table-actions-cell"
              role="columnheader"
            >
              <span className="bls-sr-only">{actions.label}</span>
            </div>
          )}
        </div>
      </div>
      {sections.map((section) => {
        const collapsed = isCollapsed(section.value);
        const groupLabel =
          section.value === ""
            ? (grouping?.emptyLabel ?? "")
            : (section.value ?? "");
        const decoration =
          section.value !== null
            ? grouping?.decorate?.(section.value)
            : undefined;
        return (
          <Fragment key={section.value ?? "\0pinned"}>
            {section.value !== null && (
              <div
                className="bls-table-group"
                role="row"
                aria-expanded={!collapsed}
                aria-level={1}
                {...groupColorProps(decoration?.color)}
              >
                <div
                  className="bls-table-cell"
                  role="gridcell"
                  aria-colspan={
                    shownColumns.length + (actions !== undefined ? 1 : 0)
                  }
                >
                  <button
                    type="button"
                    className="bls-table-group-toggle"
                    aria-expanded={!collapsed}
                    aria-label={groupLabel}
                    onClick={() => grouping?.onToggle(section.value!)}
                  >
                    <PathIcon
                      path={collapsed ? CHEVRON_RIGHT_PATH : CHEVRON_DOWN_PATH}
                    />
                  </button>
                  {decoration?.image != null && (
                    <span className="bls-table-group-image">
                      {decoration.image}
                    </span>
                  )}
                  <span className="bls-table-truncate bls-table-group-label">
                    {groupLabel}
                  </span>
                  <span className="bls-table-group-count">
                    {section.rows.length}
                  </span>
                  {grouping?.actions !== undefined && (
                    <span className="bls-table-group-actions">
                      {grouping.actions(section.value)}
                    </span>
                  )}
                </div>
              </div>
            )}
            {!collapsed &&
              section.rows.map((row) =>
                section.value !== null
                  ? renderRow(row, 2, decoration?.color)
                  : renderRow(row),
              )}
          </Fragment>
        );
      })}
    </div>
  );
};

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * Context menu button and popover menu rendered in the row actions column.
 */
export const RowMenu: FC<{ label: string; items: RowMenuItem[] }> = ({
  label,
  items,
}) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Flip popover direction upward when near the bottom of the table viewport.
  useLayoutEffect(() => {
    if (!open || menu.current === null || root.current === null) {
      return;
    }
    const bounds = (
      root.current.closest(".bls-table") ?? document.documentElement
    ).getBoundingClientRect();
    const button = root.current.getBoundingClientRect();
    const height = menu.current.offsetHeight + 4;
    menu.current.classList.toggle(
      "is-above",
      button.bottom + height > bounds.bottom &&
        button.top - height >= bounds.top,
    );
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (items.length === 0) {
    return <span className="bls-row-menu-spacer" />;
  }

  return (
    <div className="bls-row-menu" ref={root}>
      <button
        type="button"
        className="bls-btn bls-btn-weak bls-btn-icon bls-row-hover-only"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <PathIcon path={DOTS_PATH} />
      </button>
      {open && (
        <div ref={menu} className="bls-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={
                item.danger ? "bls-menu-item is-danger" : "bls-menu-item"
              }
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export type RowAction = {
  label: string;
  onSelect: () => void;
  /**
   * A Vortex icon, the button shows it alone with the label as its tooltip. Without one the button shows the label
   */
  icon?: string;
  disabled?: boolean;
  /**
   * Over the label, like why the action is disabled
   */
  title?: string;
  className?: string;
};

/**
 * A row's actions cell, as the Modern UI Mods table has it: the main action as a button shown on hover, the rest in
 * the row menu. Clicking the button doesn't select the row
 */
export const RowActions: FC<{
  primary: RowAction;
  menuLabel: string;
  items: RowMenuItem[];
}> = ({ primary, menuLabel, items }) => {
  const iconOnly = primary.icon !== undefined;
  return (
    <>
      <button
        type="button"
        className={[
          iconOnly
            ? "bls-btn bls-btn-weak bls-btn-icon bls-row-hover-only"
            : "bls-btn bls-btn-moderate bls-row-hover-only",
          primary.className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={iconOnly ? primary.label : undefined}
        title={primary.title ?? (iconOnly ? primary.label : undefined)}
        disabled={primary.disabled}
        onClick={(event) => {
          event.stopPropagation();
          primary.onSelect();
        }}
      >
        {iconOnly ? <Icon name={primary.icon!} /> : primary.label}
      </button>
      <RowMenu label={menuLabel} items={items} />
    </>
  );
};

import React, { FC, useCallback, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actions, types } from "@nexusmods/vortex-api";
import { ModernTableColumn } from "./ModernTable";

export type ColumnToggle = {
  id: string;
  label: string;
  visible: boolean;
};

/**
 * Which of a table's toggleable columns are hidden. Kept in Vortex's table settings under the table's id, as the
 * Modern UI Mods table keeps its own, so they're remembered. Every column shows until the user hides it.
 */
export const useColumnVisibility = <T,>(
  tableId: string,
  columns: ModernTableColumn<T>[],
): {
  hiddenColumns: string[];
  toggles: ColumnToggle[];
  canReset: boolean;
  setVisible: (columnId: string, visible: boolean) => void;
  reset: () => void;
} => {
  const attributes = useSelector(
    (state: types.IState) => state.settings.tables[tableId]?.attributes,
  );
  const dispatch = useDispatch();

  const hiddenColumns = useMemo(
    () =>
      columns
        .filter(
          (column) =>
            column.toggleable === true &&
            attributes?.[column.id]?.enabled === false,
        )
        .map((column) => column.id),
    [columns, attributes],
  );

  const toggles = useMemo(
    () =>
      columns
        .filter((column) => column.toggleable === true)
        .map((column) => ({
          id: column.id,
          label: column.label,
          visible: !hiddenColumns.includes(column.id),
        })),
    [columns, hiddenColumns],
  );

  const setVisible = useCallback(
    (columnId: string, visible: boolean) => {
      dispatch(actions.setAttributeVisible(tableId, columnId, visible));
    },
    [dispatch, tableId],
  );

  const reset = useCallback(() => {
    for (const columnId of hiddenColumns) {
      setVisible(columnId, true);
    }
  }, [hiddenColumns, setVisible]);

  return {
    hiddenColumns,
    toggles,
    canReset: hiddenColumns.length > 0,
    setVisible,
    reset,
  };
};

// The React version targeted by the extension environment does not provide `React.useId`.
let togglesCount = 0;

/**
 * The display options' section for choosing the table's columns, one toggle button each (the Modern UI's
 * ModsTableColumnToggles).
 */
export const ColumnToggles: FC<{
  title: string;
  toggles: ColumnToggle[];
  onToggle: (columnId: string, visible: boolean) => void;
}> = ({ title, toggles, onToggle }) => {
  const idRef = useRef<string | null>(null);
  idRef.current ??= `bls-column-toggles-${++togglesCount}`;
  const titleId = idRef.current;

  if (toggles.length === 0) {
    return null;
  }

  return (
    <div className="bls-popover-group bls-column-toggles">
      <p className="bls-column-toggles-title" id={titleId}>
        {title}
      </p>
      <div
        className="bls-column-toggles-list"
        role="group"
        aria-labelledby={titleId}
      >
        {toggles.map(({ id, label, visible }) => (
          <button
            key={id}
            type="button"
            className="bls-btn bls-btn-small bls-column-toggle"
            aria-pressed={visible}
            onClick={() => onToggle(id, !visible)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

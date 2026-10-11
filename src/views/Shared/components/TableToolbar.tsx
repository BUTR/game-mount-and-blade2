import React, {
  FC,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "vortex-api";
import { PathIcon } from "./ModernTable";

/**
 * Header toolbar positioned above a data table (housing view switchers on the left, search and filters on the right).
 */
export const TableToolbar: FC<{ start?: ReactNode; children?: ReactNode }> = ({
  start,
  children,
}) => (
  <div className="bls-table-toolbar">
    <div className="bls-table-toolbar-start">{start}</div>
    <div className="bls-toolbar">{children}</div>
  </div>
);

export type ToolbarView = {
  id: string;
  label: string;
  /**
   * Numeric badge or placeholder indicating count for this view.
   */
  count?: number | string;
};

/**
 * Tab-style view switcher buttons (mirroring the Mods table view options, e.g., 'All mods / Collections').
 */
export const ToolbarViews: FC<{
  label: string;
  views: ToolbarView[];
  selected: string;
  onSelect: (id: string) => void;
}> = ({ label, views, selected, onSelect }) => (
  <div className="bls-views" role="group" aria-label={label}>
    {views.map((view) => (
      <button
        key={view.id}
        type="button"
        className="bls-btn bls-btn-view"
        aria-pressed={view.id === selected}
        onClick={() => onSelect(view.id)}
      >
        {view.label}
        {view.count !== undefined && (
          <span className="bls-count">{view.count}</span>
        )}
      </button>
    ))}
  </div>
);

/**
 * Expandable search input button. Remains open while containing input text; Escape clears text or collapses the input.
 */
export const ToolbarSearch: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => {
  const [open, setOpen] = useState(value !== "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      input.current?.focus();
    }
  }, [open]);

  const close = (): void => {
    onChange("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Escape") {
      return;
    }
    event.stopPropagation();
    if (value !== "") {
      onChange("");
    } else {
      setOpen(false);
    }
  };

  return (
    <div className="bls-toolbar-search">
      {open && (
        <div className="bls-toolbar-search-field">
          <Icon name="search" />
          <input
            ref={input}
            type="text"
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => value === "" && setOpen(false)}
            onKeyDown={onKeyDown}
          />
        </div>
      )}
      <button
        type="button"
        className="bls-btn bls-btn-weak bls-btn-icon"
        aria-expanded={open}
        aria-label={open ? `${label}: close` : label}
        title={open ? undefined : label}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name={open ? "close" : "search"} />
      </button>
    </div>
  );
};

// The React version targeted by the extension environment does not provide `React.useId`.
let popoverCount = 0;

// mdiTune, mdiUnfoldMoreHorizontal and mdiCheck from Material Design Icons (@mdi/js, Apache 2.0), the icons of the
// Modern UI's Display options and its pickers
const TUNE_PATH =
  "M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z";
const UNFOLD_PATH =
  "M12,18.17L8.83,15L7.42,16.41L12,21L16.59,16.41L15.17,15M12,5.83L15.17,9L16.58,7.59L12,3L7.41,7.59L8.83,9L12,5.83Z";
const CHECK_PATH = "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";

/**
 * Toolbar button and dropdown popover panel. Dismisses on Escape or clicking outside the popover.
 */
const ToolbarPopover: FC<{
  label: string;
  icon: ReactNode;
  /**
   * Shows only the icon, with the label as its tooltip, like the Modern UI's toolbar controls.
   */
  iconOnly?: boolean;
  /**
   * Count badged on the button, hidden when zero.
   */
  badge?: number;
  footer?: ReactNode;
  children: ReactNode;
}> = ({ label, icon, iconOnly = false, badge = 0, footer, children }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelIdRef = useRef<string | null>(null);
  panelIdRef.current ??= `bls-popover-${++popoverCount}`;
  const panelId = panelIdRef.current;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    // A control in the panel that handled Escape itself, like a picker closing its list, keeps the panel open
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape" && !event.defaultPrevented) {
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

  return (
    <div className="bls-popover" ref={root}>
      <button
        type="button"
        className={
          iconOnly
            ? "bls-btn bls-btn-weak bls-btn-icon"
            : "bls-btn bls-btn-weak"
        }
        aria-expanded={open}
        aria-controls={panelId}
        {...(iconOnly
          ? { "aria-label": label, ...(open ? {} : { title: label }) }
          : {})}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {!iconOnly && label}
        {badge > 0 && <span className="bls-count">{badge}</span>}
      </button>
      {open && (
        <div
          className="bls-popover-panel"
          id={panelId}
          role="dialog"
          aria-label={label}
        >
          {children}
          {footer !== undefined && (
            <div className="bls-popover-group bls-popover-footer">{footer}</div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Filters button and popover, with a reset link while any filter is active.
 */
export const FilterPopover: FC<{
  label: string;
  /**
   * Count of currently active filters, badged on the button.
   */
  activeCount: number;
  resetLabel: string;
  onReset: () => void;
  children: ReactNode;
}> = ({ label, activeCount, resetLabel, onReset, children }) => (
  <ToolbarPopover
    label={label}
    icon={<Icon name="filter" />}
    badge={activeCount}
    {...(activeCount > 0
      ? {
          footer: (
            <button type="button" className="bls-link-button" onClick={onReset}>
              {resetLabel}
            </button>
          ),
        }
      : {})}
  >
    {children}
  </ToolbarPopover>
);

/**
 * Display options button and popover, holding how the table is shown (the Modern UI's useDisplayOptionsAction): an
 * icon-only button, rows of settings, and a reset link while any setting is changed from its default.
 */
export const DisplayOptionsPopover: FC<{
  label: string;
  canReset: boolean;
  resetLabel: string;
  onReset: () => void;
  children: ReactNode;
}> = ({ label, canReset, resetLabel, onReset, children }) => (
  <ToolbarPopover
    label={label}
    icon={<PathIcon path={TUNE_PATH} />}
    iconOnly
    {...(canReset
      ? {
          footer: (
            <button type="button" className="bls-link-button" onClick={onReset}>
              {resetLabel}
            </button>
          ),
        }
      : {})}
  >
    {children}
  </ToolbarPopover>
);

/**
 * A band of setting rows in a popover, separated from the next by a rule (the Modern UI's PopoverPanelGroup).
 */
export const PopoverGroup: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="bls-popover-group">{children}</div>
);

export type PickerOption<T> = { value: T; label: string };

/**
 * A setting row in a popover: its label on the left, and a picker on the right that opens a list of its options
 * (the Modern UI's PopoverPanelGroupItem with a Picker). Escape and clicking outside close the list.
 */
export const PopoverPicker = <T,>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
}): JSX.Element => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  idRef.current ??= `bls-picker-${++popoverCount}`;
  const id = idRef.current;
  const selectedIndex = options.findIndex((option) => option.value === value);

  const getItems = (): HTMLButtonElement[] => [
    ...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
      []),
  ];

  useEffect(() => {
    if (!open) {
      return;
    }
    // The list opens on the chosen option, as a select does
    getItems()[Math.max(selectedIndex, 0)]?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      // Marked handled, so the popover the picker is in stays open
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = getItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? Math.min(index + 1, items.length - 1)
        : event.key === "ArrowUp"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  };

  return (
    <div className="bls-popover-row">
      <span className="bls-popover-row-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="bls-picker" ref={root}>
        <button
          ref={button}
          type="button"
          id={`${id}-button`}
          className="bls-btn bls-btn-moderate bls-btn-small"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}-button`}
          onClick={() => setOpen(!open)}
        >
          {options[selectedIndex]?.label}
          <PathIcon path={UNFOLD_PATH} />
        </button>
        {open && (
          <div
            ref={list}
            className="bls-menu"
            role="listbox"
            aria-labelledby={`${id}-label`}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => (
              <button
                key={option.label}
                type="button"
                role="option"
                className="bls-menu-item"
                aria-selected={index === selectedIndex}
                tabIndex={-1}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
              >
                <span className="bls-menu-item-label">{option.label}</span>
                {index === selectedIndex && <PathIcon path={CHECK_PATH} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Section container grouping related filters with a header title within the filter popover.
 */
export const FilterGroup: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div className="bls-popover-group" role="group" aria-label={title}>
    <span className="bls-popover-title">{title}</span>
    {children}
  </div>
);

export const FilterCheckbox: FC<{
  label: string;
  checked: boolean;
  /**
   * Number of matching rows remaining, displayed alongside the filter label.
   */
  count?: number;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, count, onChange }) => (
  <label className="bls-popover-item">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="bls-popover-item-label">{label}</span>
    {count !== undefined && <span className="bls-muted">{count}</span>}
  </label>
);

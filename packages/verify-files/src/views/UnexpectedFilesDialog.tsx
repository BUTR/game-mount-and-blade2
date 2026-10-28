import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MainContext } from "@nexusmods/vortex-api";
import { ActionButton } from "@bannerlord/ui/components/Controls";
import {
  ModernTable,
  TableGrouping,
  TableSort,
} from "@bannerlord/ui/components/ModernTable";
import { useLocalization } from "@bannerlord/core/localization/hooks";
import {
  answerUnexpectedFiles,
  getShownUnexpectedFiles,
  subscribeUnexpectedFiles,
  UNEXPECTED_FILES_DIALOG_ID,
  UnexpectedFilesDialogState,
} from "../unexpectedFilesDialog";
import { getStoreName, showModInModsPage } from "../verify";
import { getVerifyFileColumns, getVerifyFileId } from "./tableAttributes";

// Like the Game files page, a folder with more files starts collapsed
const COLLAPSED_FOLDER_SIZE = 10;
// The rows are under their folder's group, which already shows the folder
const HIDDEN_COLUMNS = ["folder"];

const TITLE_ID = `${UNEXPECTED_FILES_DIALOG_ID}-title`;

export type UnexpectedFilesDialogProps = {
  /**
   * Whether Vortex shows the dialog, it renders every registered dialog and passes this
   */
  visible?: boolean;
  onHide?: () => void;
};

const UnexpectedFilesContent: FC<{
  state: UnexpectedFilesDialogState;
  onAnswer: (action: string) => void;
}> = ({ state, onAnswer }) => {
  const { api } = useContext(MainContext);
  const { localize: t } = useLocalization();
  const { report, files, title, text, actions, dismissAction } = state;
  const storeName = getStoreName(report.store);

  const [sort, setSort] = useState<TableSort | null>({
    columnId: "path",
    direction: "asc",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The folders opened or closed against their default
  const [toggledFolders, setToggledFolders] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const showMod = useCallback(
    (modId: string): void => {
      onAnswer(dismissAction);
      showModInModsPage(api, modId);
    },
    [api, onAnswer, dismissAction],
  );
  const columns = useMemo(
    () => getVerifyFileColumns(t, true, showMod, storeName),
    [t, showMod, storeName],
  );

  const grouping = useMemo((): TableGrouping => {
    const sizes = new Map<string, number>();
    for (const file of files) {
      sizes.set(file.folder, (sizes.get(file.folder) ?? 0) + 1);
    }
    return {
      columnId: "folder",
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
    };
  }, [files, toggledFolders, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onAnswer(dismissAction);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAnswer, dismissAction]);

  return (
    <div id={UNEXPECTED_FILES_DIALOG_ID} className="bls-modal">
      <div
        className="bls-modal-overlay"
        onClick={() => onAnswer(dismissAction)}
      />
      <div
        className="bls-page bls-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <h2 id={TITLE_ID} className="bls-modal-title">
          {title}
        </h2>
        <p className="bls-modal-text">{text}</p>
        <div className="bls-modal-table">
          <ModernTable
            label={t("Unexpected files")}
            rows={files}
            getId={getVerifyFileId}
            columns={columns}
            hiddenColumns={HIDDEN_COLUMNS}
            sort={sort}
            onSortChange={setSort}
            grouping={grouping}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="bls-modal-actions">
          {actions.map((action) => (
            // The primary one is the default answer, focused like the default button of Vortex's dialogs
            <ActionButton
              key={action.id}
              variant={action.primary === true ? "primary" : "moderate"}
              autoFocus={action.primary === true}
              onClick={() => onAnswer(action.id)}
            >
              {action.label}
            </ActionButton>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Unexpected files in the game folder, in a modal like the Modern UI's with the Game files page's table. Shown when
 * Vortex started managing the game and before a collection installs. Registered as a Vortex dialog, so Vortex shows it
 * when it's the visible dialog
 */
export const UnexpectedFilesDialog: FC<UnexpectedFilesDialogProps> = ({
  visible,
  onHide,
}) => {
  const [state, setState] = useState(getShownUnexpectedFiles);
  useEffect(
    () => subscribeUnexpectedFiles(() => setState(getShownUnexpectedFiles())),
    [],
  );

  const onAnswer = useCallback(
    (action: string): void => {
      if (state === undefined) {
        return;
      }
      answerUnexpectedFiles(state, action);
      onHide?.();
    },
    [state, onHide],
  );

  // Vortex showing another dialog instead hides this one without an answer, it's dismissed then
  const wasVisible = useRef(false);
  useEffect(() => {
    if (wasVisible.current && visible !== true && state !== undefined) {
      answerUnexpectedFiles(state, state.dismissAction);
    }
    wasVisible.current = visible === true;
  }, [visible, state]);

  if (visible !== true || state === undefined) {
    return null;
  }
  return <UnexpectedFilesContent state={state} onAnswer={onAnswer} />;
};

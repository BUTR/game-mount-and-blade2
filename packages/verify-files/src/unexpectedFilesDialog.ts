import { actions, types } from "@nexusmods/vortex-api";
import { IVerifyFile, IVerifyFilesReport } from "./types";

export const UNEXPECTED_FILES_DIALOG_ID = "bannerlord-unexpected-files";

export type UnexpectedFilesAction<T extends string> = {
  id: T;
  label: string;
  /**
   * The default answer, the primary button, focused when the dialog opens
   */
  primary?: boolean;
};

/**
 * What the dialog says about the files and the answers it offers, already localized
 */
export type UnexpectedFilesDialogContent<T extends string> = {
  title: string;
  text: string;
  actions: UnexpectedFilesAction<T>[];
  /**
   * The answer when the dialog is closed without a button: Escape, a click beside it, another dialog shown instead
   */
  dismissAction: T;
};

/**
 * The unexpected files the dialog shows, and the answer its caller waits for
 */
export type UnexpectedFilesDialogState =
  UnexpectedFilesDialogContent<string> & {
    report: IVerifyFilesReport;
    files: IVerifyFile[];
    answer: (action: string) => void;
  };

let shown: UnexpectedFilesDialogState | undefined;
const listeners = new Set<() => void>();

const setShown = (next: UnexpectedFilesDialogState | undefined): void => {
  shown = next;
  for (const listener of listeners) {
    listener();
  }
};

export const getShownUnexpectedFiles = ():
  | UnexpectedFilesDialogState
  | undefined => shown;

/**
 * Calls the listener when the dialog shows other files or is answered. Returns the unsubscribe
 */
export const subscribeUnexpectedFiles = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The user's answer, from the dialog's buttons, or its dismiss action when it's closed otherwise. Only the shown
 * dialog is answered, and once
 */
export const answerUnexpectedFiles = (
  state: UnexpectedFilesDialogState,
  action: string,
): void => {
  if (shown !== state) {
    return;
  }
  setShown(undefined);
  state.answer(action);
};

/**
 * Shows the unexpected files in the extension's own dialog, a table like the Game files page's in the Modern UI look on
 * every Vortex version. Resolves the id of the action the user chose. A dialog still shown is answered with its dismiss
 * action
 */
export const showUnexpectedFilesAsync = <T extends string>(
  api: types.IExtensionApi,
  report: IVerifyFilesReport,
  files: IVerifyFile[],
  content: UnexpectedFilesDialogContent<T>,
): Promise<T> =>
  new Promise((resolve) => {
    if (shown !== undefined) {
      answerUnexpectedFiles(shown, shown.dismissAction);
    }
    const state: UnexpectedFilesDialogState = {
      ...content,
      report,
      files,
      answer: (action) => resolve(action as T),
    };
    setShown(state);
    api.store?.dispatch(actions.setDialogVisible(UNEXPECTED_FILES_DIALOG_ID));
  });

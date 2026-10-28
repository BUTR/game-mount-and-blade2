import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { IVerifyFile, IVerifyFilesReport } from "./types";
import {
  answerUnexpectedFiles,
  getShownUnexpectedFiles,
  showUnexpectedFilesAsync,
  subscribeUnexpectedFiles,
  UNEXPECTED_FILES_DIALOG_ID,
  UnexpectedFilesDialogContent,
} from "./unexpectedFilesDialog";

vi.mock("@nexusmods/vortex-api", () => ({
  actions: {
    setDialogVisible: (id: string) => ({ type: "SET_DIALOG_VISIBLE", id }),
  },
  types: {},
}));

const report: IVerifyFilesReport = {
  store: "steam",
  buildId: "1",
  storeUrl: "steam://validate/261550",
  expectedFileCount: 10,
  sizesKnown: true,
  contentsChecked: false,
  missingLists: [],
  files: [],
};

const files: IVerifyFile[] = [
  {
    path: "bin/package_info.txt",
    folder: "bin",
    status: "extra",
    source: "unknown",
  },
];

const content: UnexpectedFilesDialogContent<"close" | "review"> = {
  title: "The Game Folder Has Unexpected Files",
  text: "1 file doesn't match the Steam build",
  actions: [
    { id: "close", label: "Close" },
    { id: "review", label: "Review", primary: true },
  ],
  dismissAction: "close",
};

describe("unexpectedFilesDialog", () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let api: types.IExtensionApi;

  beforeEach(() => {
    dispatch = vi.fn();
    api = { store: { dispatch } } as unknown as types.IExtensionApi;
  });

  afterEach(() => {
    // Each test starts without a shown dialog
    const shown = getShownUnexpectedFiles();
    if (shown !== undefined) {
      answerUnexpectedFiles(shown, shown.dismissAction);
    }
  });

  it("shows the files in the extension's dialog and resolves the chosen action", async () => {
    const answered = showUnexpectedFilesAsync(api, report, files, content);

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_DIALOG_VISIBLE",
      id: UNEXPECTED_FILES_DIALOG_ID,
    });
    const shown = getShownUnexpectedFiles()!;
    expect(shown.report).toBe(report);
    expect(shown.files).toBe(files);
    expect(shown.title).toBe(content.title);
    expect(shown.actions).toBe(content.actions);

    answerUnexpectedFiles(shown, "review");
    await expect(answered).resolves.toBe("review");
    expect(getShownUnexpectedFiles()).toBeUndefined();
  });

  it("answers once", async () => {
    const answered = showUnexpectedFilesAsync(api, report, files, content);
    const shown = getShownUnexpectedFiles()!;

    answerUnexpectedFiles(shown, "close");
    answerUnexpectedFiles(shown, "review");
    await expect(answered).resolves.toBe("close");
  });

  it("answers a dialog still shown with its dismiss action when another replaces it", async () => {
    const first = showUnexpectedFilesAsync(api, report, files, content);
    const firstShown = getShownUnexpectedFiles()!;
    const second = showUnexpectedFilesAsync(api, report, [], {
      ...content,
      dismissAction: "review",
    });

    await expect(first).resolves.toBe("close");
    // The replaced dialog's late answer doesn't answer the one shown
    answerUnexpectedFiles(firstShown, "review");
    expect(getShownUnexpectedFiles()?.files).toEqual([]);

    answerUnexpectedFiles(getShownUnexpectedFiles()!, "close");
    await expect(second).resolves.toBe("close");
  });

  it("tells the subscribers when the dialog is shown and answered, until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnexpectedFiles(listener);

    void showUnexpectedFilesAsync(api, report, files, content);
    answerUnexpectedFiles(getShownUnexpectedFiles()!, "close");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    void showUnexpectedFilesAsync(api, report, files, content);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

import path from "path";
import { types } from "@nexusmods/vortex-api";
import { VerifyFilesPage } from "./views/VerifyFilesPage";
import { VerifyFilesPageOptions } from "./views/options";
import { UnexpectedFilesDialog } from "./views/UnexpectedFilesDialog";
import { watchGameFolderWrites } from "./keptReport";
import { watchCollectionInstalls } from "./collectionInstall";
import { UNEXPECTED_FILES_DIALOG_ID } from "./unexpectedFilesDialog";

export const registerVerifyFiles = (context: types.IExtensionContext): void => {
  context.registerMainPage(
    /*icon:*/ "inspect",
    /*title:*/ "Game files",
    /*element:*/ VerifyFilesPage,
    /*options:*/ new VerifyFilesPageOptions(context),
  );

  context.registerDialog(UNEXPECTED_FILES_DIALOG_ID, UnexpectedFilesDialog);

  context.once(() => {
    context.api.setStylesheet(
      "verifyfiles",
      path.join(__dirname, "verifyfiles.scss"),
    );

    watchGameFolderWrites(context.api);
    watchCollectionInstalls(context.api);
  });
};

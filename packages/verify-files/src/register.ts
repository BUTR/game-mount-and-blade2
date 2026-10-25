import path from "path";
import { types } from "@nexusmods/vortex-api";
import { VerifyFilesPage } from "./views/VerifyFilesPage";
import { VerifyFilesPageOptions } from "./views/options";

export const registerVerifyFiles = (context: types.IExtensionContext): void => {
  context.registerMainPage(
    /*icon:*/ "inspect",
    /*title:*/ "Game files",
    /*element:*/ VerifyFilesPage,
    /*options:*/ new VerifyFilesPageOptions(context),
  );

  context.once(() => {
    context.api.setStylesheet(
      "verifyfiles",
      path.join(__dirname, "verifyfiles.scss"),
    );
  });
};

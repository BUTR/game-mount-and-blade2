import path from "path";
import { types } from "@nexusmods/vortex-api";
import { SavePage } from "./views/SavePage";
import { SavePageOptions } from "./views/options";

export const registerSaves = (context: types.IExtensionContext): void => {
  context.registerMainPage(
    /*icon:*/ "savegame",
    /*title:*/ "Saves",
    /*element:*/ SavePage,
    /*options:*/ new SavePageOptions(context),
  );

  context.once(() => {
    context.api.setStylesheet(
      "savegame",
      path.join(__dirname, "savegame.scss"),
    );
  });
};

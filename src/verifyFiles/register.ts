import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { getVerifyStore } from "./verify";
import { VerifyFilesPage } from "../views/VerifyFiles/VerifyFilesPage";
import {
  VERIFY_FILES_PAGE_ID,
  VerifyFilesPageOptions,
} from "../views/VerifyFiles/options";

export const registerVerifyFiles = (context: types.IExtensionContext): void => {
  context.registerMainPage(
    /*icon:*/ "inspect",
    /*title:*/ "Game Files",
    /*element:*/ VerifyFilesPage,
    /*options:*/ new VerifyFilesPageOptions(context),
  );

  const openPage = (): void => {
    context.api.events.emit("show-main-page", VERIFY_FILES_PAGE_ID);
  };

  const isVerifiableInstall = (): boolean => {
    const state = context.api.getState();
    return (
      selectors.activeGameId(state) === GAME_ID &&
      getVerifyStore(state) !== undefined
    );
  };

  context.registerAction(
    /*group:*/ `game-managed-buttons`,
    /*position:*/ 160,
    /*iconOrComponent:*/ `inspect`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Verify Files+`,
    /*actionOrCondition?:*/ openPage,
    /*condition?:*/ (instanceIds?: string[]): boolean =>
      instanceIds?.[0] === GAME_ID && isVerifiableInstall(),
  );

  context.registerAction(
    /*group:*/ `mod-icons`,
    /*position:*/ 300,
    /*iconOrComponent:*/ `inspect`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Verify Files+`,
    /*actionOrCondition?:*/ openPage,
    /*condition?:*/ isVerifiableInstall,
  );
};

import { selectors, types } from "vortex-api";
import { GAME_ID } from "../common";
import { VortexLauncherManager } from "../launcher";
import { LoadOrderManager } from "./manager";
import { toggleLoadOrderAsync } from "./utils";

export const registerLoadOrder = (context: types.IExtensionContext): void => {
  context.registerLoadOrder(
    /*gameInfo:*/ LoadOrderManager.getInstance(context.api),
  );

  const isMB2 = (): boolean =>
    selectors.activeGameId(context.api.getState()) === GAME_ID;

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 200,
    /*iconOrComponent:*/ `loot-sort`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Auto Sort`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      const launcherManager = VortexLauncherManager.getInstance(context.api);
      void launcherManager.autoSortAsync();
    },
    /*condition?:*/ isMB2,
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 210,
    /*iconOrComponent:*/ `checkbox-checked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Enable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      void toggleLoadOrderAsync(context.api, true);
    },
    /*condition?:*/ isMB2,
  );

  context.registerAction(
    /*group:*/ `fb-load-order-icons`,
    /*position:*/ 215,
    /*iconOrComponent:*/ `checkbox-unchecked`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Disable All Mods`,
    /*actionOrCondition?:*/ (_instanceIds?: string[]): boolean | void => {
      void toggleLoadOrderAsync(context.api, false);
    },
    /*condition?:*/ isMB2,
  );

  // Import from Novus
  // Import from LauncherEx
  // Export to LauncherEx

  /* Disabled for now because the name is too long
  context.registerAction(
    `fb-load-order-icons`,
    201,
    `changelog`,
    {},
    `Fetch Compatibility Scores`,
    (_instanceIds?: string[]): boolean | void => {
      const loadOrderManager = LoadOrderManager.getInstance(context.api);
      loadOrderManager.updateCompatibilityScores();
    },
    isMB2
  );
  */
};

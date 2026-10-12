import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { VortexLauncherManager } from "../launcher/manager";
import { LoadOrderManager } from "./manager";
import { toggleLoadOrderAsync } from "./utils";
import { switchGameModeAsync } from "../profileType/switch";
import { bselectors } from "../selectors";
import { GameMode } from "../settings/types";
import { IStateWithBannerlord } from "../types";

export const registerLoadOrder = (context: types.IExtensionContext): void => {
  context.registerLoadOrder(
    /*gameInfo:*/ LoadOrderManager.getInstance(context.api),
  );

  const isMB2 = (): boolean =>
    selectors.activeGameId(context.api.getState()) === GAME_ID;

  // Switching to a profile of the other type on the game tile, for the managed game only: switching needs its active
  // profile
  const canSwitchTo =
    (gameMode: GameMode) =>
    (instanceIds?: string[]): boolean => {
      const state = context.api.getState<IStateWithBannerlord>();
      return (
        instanceIds?.[0] === GAME_ID &&
        isMB2() &&
        bselectors.activeGameMode(state) !== gameMode
      );
    };
  context.registerAction(
    /*group:*/ `game-managed-buttons`,
    /*position:*/ 150,
    /*iconOrComponent:*/ `game`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Switch to Singleplayer`,
    /*actionOrCondition?:*/ (): void => {
      void switchGameModeAsync(context.api, "singleplayer");
    },
    /*condition?:*/ canSwitchTo("singleplayer"),
  );
  context.registerAction(
    /*group:*/ `game-managed-buttons`,
    /*position:*/ 151,
    /*iconOrComponent:*/ `connection`,
    /*options:*/ {},
    /*titleOrProps?:*/ `Switch to Multiplayer`,
    /*actionOrCondition?:*/ (): void => {
      void switchGameModeAsync(context.api, "multiplayer");
    },
    /*condition?:*/ canSwitchTo("multiplayer"),
  );

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

import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { bselectors } from "../selectors";
import { GameMode } from "../settings/types";
import { IStateWithBannerlord } from "../types";
import { changeProfileGameModeAsync } from "../loadOrder/gameMode";
// Not the servers index, which reaches the views
import { NO_MODS_PROFILE_FEATURE } from "../servers/profiles";

/**
 * The profile type: a feature Vortex shows on the profile's card and as a checkbox when editing the profile,
 * and actions on the card changing it
 */
export const registerProfileType = (context: types.IExtensionContext): void => {
  context.registerProfileFeature?.(
    MULTIPLAYER_PROFILE_FEATURE,
    "boolean",
    "connection",
    "Multiplayer",
    // Vortex shows it next to the checkbox when creating or editing a profile, and as the card's tooltip
    "Multiplayer profile",
    () => selectors.activeGameId(context.api.getState()) === GAME_ID,
  );

  const canChangeTo =
    (gameMode: GameMode) =>
    (instanceIds?: string[]): boolean => {
      const profileId = instanceIds?.[0];
      if (profileId === undefined) {
        return false;
      }
      const state = context.api.getState<IStateWithBannerlord>();
      const profile = selectors.profileById(state, profileId);
      return (
        profile?.gameId === GAME_ID &&
        // Shared across all unmodded servers, it stays Multiplayer
        profile.features?.[NO_MODS_PROFILE_FEATURE] !== true &&
        bselectors.gameModeForProfile(state, profileId) !== gameMode
      );
    };
  const changeTo =
    (gameMode: GameMode) =>
    (instanceIds?: string[]): void => {
      const profileId = instanceIds?.[0];
      if (profileId !== undefined) {
        void changeProfileGameModeAsync(context.api, profileId, gameMode);
      }
    };

  context.registerAction(
    /*group:*/ "profile-actions",
    /*position:*/ 150,
    /*iconOrComponent:*/ "game",
    /*options:*/ {},
    /*titleOrProps?:*/ "Change to Singleplayer",
    /*actionOrCondition?:*/ changeTo("singleplayer"),
    /*condition?:*/ canChangeTo("singleplayer"),
  );
  context.registerAction(
    /*group:*/ "profile-actions",
    /*position:*/ 151,
    /*iconOrComponent:*/ "connection",
    /*options:*/ {},
    /*titleOrProps?:*/ "Change to Multiplayer",
    /*actionOrCondition?:*/ changeTo("multiplayer"),
    /*condition?:*/ canChangeTo("multiplayer"),
  );
};

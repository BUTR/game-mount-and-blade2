import { actions, selectors, types } from "vortex-api";
import { LoadOrderManager } from "./manager";
import { GameMode } from "../settings/types";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";
import { LocalizationManager } from "../localization/manager";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
// Not the servers index, which reaches the views
import { NO_MODS_PROFILE_FEATURE } from "../servers/profiles";
import {
  applyGameModeTools,
  rememberPrimaryTool,
} from "../vortex/gameModeTools";

/**
 * Changes the profile's type between Singleplayer and Multiplayer. The No Mods profile stays Multiplayer.
 * The active profile's load order, tools and primary tool follow through watchActiveProfileType
 */
export const changeProfileGameModeAsync = (
  api: types.IExtensionApi,
  profileId: string,
  gameMode: GameMode,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.profileById(state, profileId);
  if (
    profile === undefined ||
    profile.features?.[NO_MODS_PROFILE_FEATURE] === true ||
    bselectors.gameModeForProfile(state, profileId) === gameMode
  ) {
    return Promise.resolve();
  }

  if (selectors.activeProfile(state)?.id === profileId) {
    rememberPrimaryTool(api);
  }
  api.store?.dispatch(
    actions.setFeature(
      profileId,
      MULTIPLAYER_PROFILE_FEATURE,
      gameMode === "multiplayer",
    ),
  );
  return Promise.resolve();
};

/**
 * When the active profile's type changes, by the profile's actions or Vortex's profile editor, shows the type's load
 * order, swaps in its tools and primary tool, and configures Vortex to launch it. Switching profiles reads the load
 * order already
 */
export const watchActiveProfileType = (api: types.IExtensionApi): void => {
  const activeType = (): {
    profileId: string | undefined;
    gameMode: GameMode;
  } => {
    const state = api.getState<IStateWithBannerlord>();
    return {
      profileId: selectors.activeProfile(state)?.id,
      gameMode: bselectors.activeGameMode(state),
    };
  };

  let last = activeType();
  api.onStateChange?.(["persistent", "profiles"], () => {
    const current = activeType();
    const changed =
      current.profileId !== undefined &&
      current.profileId === last.profileId &&
      current.gameMode !== last.gameMode;
    last = current;
    if (!changed || selectors.activeGameId(api.getState()) !== GAME_ID) {
      return;
    }

    applyGameModeTools(api);
    reloadLoadOrderAsync(api).catch((err: unknown) => {
      const { localize: t } = LocalizationManager.getInstance(api);
      api.showErrorNotification?.(t("Failed to change the profile type"), err);
    });
  });
  api.onStateChange?.(["settings", "profiles", "activeProfileId"], () => {
    last = activeType();
  });
};

/**
 * Re-reads the active profile's load order from disk and updates state, reflecting external modifications.
 */
export const reloadLoadOrderAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const profile = selectors.activeProfile(api.getState());
  if (!profile) {
    return;
  }
  const loadOrder =
    await LoadOrderManager.getInstance(api).deserializeLoadOrder();
  api.store?.dispatch(actions.setFBLoadOrder(profile.id, loadOrder));
};

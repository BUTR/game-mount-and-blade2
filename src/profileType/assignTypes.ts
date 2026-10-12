import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
// Not the servers index, which reaches the views
import {
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "../servers/profiles";

type Profiles = Record<string, types.IProfile> | undefined;

/**
 * Server and No Mods profiles are made for multiplayer servers, every other profile without a type is Singleplayer
 */
const defaultType = (profile: types.IProfile): boolean =>
  profile.features?.[SERVER_PROFILE_FEATURE] !== undefined ||
  profile.features?.[NO_MODS_PROFILE_FEATURE] === true;

const assignTypes = (api: types.IExtensionApi, profiles: Profiles): void => {
  const untyped = Object.values(profiles ?? {}).filter(
    (profile) =>
      profile.gameId === GAME_ID &&
      typeof profile.features?.[MULTIPLAYER_PROFILE_FEATURE] !== "boolean",
  );
  if (untyped.length === 0 || api.store === undefined) {
    return;
  }
  util.batchDispatch(
    api.store.dispatch,
    untyped.map((profile) =>
      actions.setFeature(
        profile.id,
        MULTIPLAYER_PROFILE_FEATURE,
        defaultType(profile),
      ),
    ),
  );
};

/**
 * Gives every profile a type. Profiles from before profiles had a type become Singleplayer once Bannerlord is managed
 * after the extension is updated, as do profiles Vortex creates without one, so their cards and editor show it.
 * Until then they are read as Singleplayer
 */
export const watchProfileTypes = (api: types.IExtensionApi): void => {
  // Only while Bannerlord is the active game, its profiles don't change while another game is managed. Switching to it
  // catches up with the profiles from before
  const assignWhileActive = (): void => {
    const state = api.getState();
    if (selectors.activeGameId(state) === GAME_ID) {
      assignTypes(api, state.persistent.profiles);
    }
  };
  assignWhileActive();
  api.onStateChange?.(["persistent", "profiles"], assignWhileActive);
  api.onStateChange?.(
    ["settings", "profiles", "activeProfileId"],
    assignWhileActive,
  );
};

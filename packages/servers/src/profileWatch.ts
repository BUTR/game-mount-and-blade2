import { actions, types } from "@nexusmods/vortex-api";
import { SERVER_NAME_PROFILE_FEATURE } from "./profiles";
import {
  GAME_ID,
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "@bannerlord/core/common";

type Profiles = Record<string, types.IProfile> | undefined;

const SERVER_FEATURES = [SERVER_PROFILE_FEATURE, NO_MODS_PROFILE_FEATURE];

/**
 * Strips server features from cloned profiles: cloning copies feature flags, which would cause clones to be treated
 * as the original server or 'No Mods' profile. Stripping the flags makes the clone a standard profile.
 * Runs whichever game is active
 */
export const watchClonedServerProfiles = (api: types.IExtensionApi): void => {
  api.onStateChange?.(["persistent", "profiles"], (previous, current) => {
    const before = (previous as Profiles) ?? {};
    const profiles = (current as Profiles) ?? {};

    for (const profile of Object.values(profiles)) {
      if (profile.gameId !== GAME_ID || before[profile.id] !== undefined) {
        continue;
      }
      for (const feature of SERVER_FEATURES) {
        const value = profile.features?.[feature];
        if (value === undefined) {
          continue;
        }
        // Check if another profile already had this feature to identify clones (and distinguish from startup loads)
        const cloned = Object.values(before).some(
          (original) =>
            original.gameId === GAME_ID &&
            original.pendingRemove !== true &&
            original.features?.[feature] === value,
        );
        if (cloned) {
          api.store?.dispatch(
            actions.setFeature(profile.id, feature, undefined),
          );
          // The server's name goes with the link to it
          if (feature === SERVER_PROFILE_FEATURE) {
            api.store?.dispatch(
              actions.setFeature(
                profile.id,
                SERVER_NAME_PROFILE_FEATURE,
                undefined,
              ),
            );
          }
        }
      }
    }
  });
};

import { actions, types } from "vortex-api";
import {
  NO_MODS_PROFILE_FEATURE,
  SERVER_NAME_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "./profiles";
import { GAME_ID } from "../common";
import { actionsSettings } from "../settings/actions";
// Avoid importing from loadOrder/index to prevent circular dependencies with views
import { removeProfileLoadOrdersAsync } from "../loadOrder/persistence";

type Profiles = Record<string, types.IProfile> | undefined;

const SERVER_FEATURES = [SERVER_PROFILE_FEATURE, NO_MODS_PROFILE_FEATURE];

/**
 * Synchronizes extension-managed profile data with Vortex's profile lifecycle.
 * (Vortex removes profiles without emitting events when game management stops, and older versions lack profile events.)
 * Runs whichever game is active: management usually stops while another game is managed
 *
 * - Deletes stored settings and load order files when a profile is removed.
 * - Strips server features from cloned profiles: cloning copies feature flags, which would cause clones to be
 *   treated as the original server or 'No Mods' profile. Stripping the flags makes the clone a standard profile.
 */
export const watchProfiles = (api: types.IExtensionApi): void => {
  api.onStateChange?.(["persistent", "profiles"], (previous, current) => {
    const before = (previous as Profiles) ?? {};
    const profiles = (current as Profiles) ?? {};

    for (const [profileId, profile] of Object.entries(before)) {
      if (profile.gameId === GAME_ID && profiles[profileId] === undefined) {
        api.store?.dispatch(actionsSettings.removeProfileSettings(profileId));
        void removeProfileLoadOrdersAsync(api, profileId);
      }
    }

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

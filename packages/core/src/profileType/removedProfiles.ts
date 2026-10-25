import { types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { actionsSettings } from "../settings/actions";
import { removeProfileLoadOrdersAsync } from "../loadOrder/persistence";

type Profiles = Record<string, types.IProfile> | undefined;

/**
 * Deletes stored settings and load order files when a profile is removed.
 * (Vortex removes profiles without emitting events when game management stops, and older versions lack profile events.)
 * Runs whichever game is active: management usually stops while another game is managed
 */
export const watchRemovedProfiles = (api: types.IExtensionApi): void => {
  api.onStateChange?.(["persistent", "profiles"], (previous, current) => {
    const before = (previous as Profiles) ?? {};
    const profiles = (current as Profiles) ?? {};

    for (const [profileId, profile] of Object.entries(before)) {
      if (profile.gameId === GAME_ID && profiles[profileId] === undefined) {
        api.store?.dispatch(actionsSettings.removeProfileSettings(profileId));
        void removeProfileLoadOrdersAsync(api, profileId);
      }
    }
  });
};

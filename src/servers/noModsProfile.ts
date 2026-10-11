import { actions, selectors, types, util } from "vortex-api";
import { isServerJoinMod } from "./join";
import { NO_MODS_PROFILE_FEATURE } from "./profiles";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";
import { LocalizationManager } from "../localization/manager";
import { IStateWithBannerlord } from "../types";

type Profiles = Record<string, types.IProfile> | undefined;

export const isNoModsProfile = (profile: types.IProfile | undefined): boolean =>
  profile?.features?.[NO_MODS_PROFILE_FEATURE] === true;

/**
 * The 'No Mods' profile is shared across all unmodded servers and only retains the Server Join helper mod.
 * Any mod enabled in this profile by other means (such as the Mods page or collections) is immediately disabled.
 */
export const watchNoModsProfile = (api: types.IExtensionApi): void => {
  api.onStateChange?.(["persistent", "profiles"], (previous, current) => {
    // Its mods and type only change while Bannerlord is the active game
    if (selectors.activeGameId(api.getState()) !== GAME_ID) {
      return;
    }
    const before = previous as Profiles;
    const profiles = current as Profiles;
    for (const profile of Object.values(profiles ?? {})) {
      if (!isNoModsProfile(profile)) {
        continue;
      }

      // Vortex's profile editor can change the type, which the profile can't do without
      if (profile.features?.[MULTIPLAYER_PROFILE_FEATURE] !== true) {
        api.store?.dispatch(
          actions.setFeature(profile.id, MULTIPLAYER_PROFILE_FEATURE, true),
        );
        if (before?.[profile.id] !== undefined) {
          const { localize: t } = LocalizationManager.getInstance(api);
          api.sendNotification?.({
            id: `bannerlord-no-mods-profile-type-${profile.id}`,
            type: "warning",
            title: t("The No Mods profile stays Multiplayer"),
            message: t(
              "'{{profile}}' is shared across all unmodded servers, so it can't be changed to Singleplayer.",
              { profile: profile.name },
            ),
          });
        }
      }

      const mods =
        api.getState<IStateWithBannerlord>().persistent.mods[GAME_ID] ?? {};
      const added = Object.entries(profile.modState ?? {})
        .filter(
          ([modId, state]) =>
            state.enabled &&
            before?.[profile.id]?.modState?.[modId]?.enabled !== true,
        )
        .map(([modId]) => modId)
        // Uninstalled mods cannot be verified here; defer cleanup to Vortex core.
        .filter((modId) => mods[modId] !== undefined)
        .filter((modId) => !isServerJoinMod(mods[modId]!));
      if (added.length === 0) {
        continue;
      }

      util.batchDispatch(
        api.store?.dispatch,
        added.map((modId) => actions.setModEnabled(profile.id, modId, false)),
      );
      const { localize: t } = LocalizationManager.getInstance(api);
      api.sendNotification?.({
        id: `bannerlord-no-mods-profile-${profile.id}`,
        type: "warning",
        title: t("The No Mods profile does not allow mods"),
        message: t(
          "'{{profile}}' is shared across all unmodded servers, so {{mods}} was disabled automatically. " +
            "To use mods, create a dedicated server profile from the server details panel.",
          {
            profile: profile.name,
            mods: added
              .map((modId) => util.renderModName(mods[modId]!))
              .join(", "),
          },
        ),
      });
    }
  });
};

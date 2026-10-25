import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import { actions, types, util } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";

/**
 * Creates a profile the way Vortex's profile page does, empty unless mod states are given
 */
export const createProfileAsync = async (
  api: types.IExtensionApi,
  name: string,
  features: Record<string, unknown>,
  modState: types.IProfile["modState"] = {},
): Promise<types.IProfile> => {
  const profile: types.IProfile = {
    id: randomBytes(9).toString("base64url"),
    gameId: GAME_ID,
    name,
    modState,
    lastActivated: 0,
    features,
  };
  await fs.mkdir(
    path.join(util.getVortexPath("userData"), GAME_ID, "profiles", profile.id),
    { recursive: true },
  );
  api.store?.dispatch(actions.setProfile(profile));
  return profile;
};

/**
 * Switches to the specified profile and waits for Vortex to finish deploying it.
 * This can take an arbitrary amount of time because switching deploys both profiles and may await user confirmation.
 * Rejects if Vortex cancels the switch or refuses to initiate it.
 */
export const switchProfileAsync = (
  api: types.IExtensionApi,
  profileId: string,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const store = api.store;
    if (store === undefined) {
      reject(new Error("The Vortex store is not available"));
      return;
    }
    const current = (): { active?: string; next?: string } => {
      const profiles = (store.getState() as types.IState).settings.profiles;
      return { active: profiles.activeProfileId, next: profiles.nextProfileId };
    };
    if (current().active === profileId) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };

    // Vortex clears nextProfileId if the profile switch is cancelled
    const unsubscribe = store.subscribe(() => {
      const { active, next } = current();
      if (active === profileId) {
        finish();
      } else if (next !== profileId) {
        finish(new util.UserCanceled());
      }
    });
    store.dispatch(actions.setNextProfile(profileId));

    // Subscribers execute synchronously during dispatch. If Vortex's sanity checks reject the action,
    // state remains unchanged without emitting notifications, so we detect unstarted switches here.
    const { active, next } = current();
    if (active !== profileId && next !== profileId) {
      finish(new Error("Vortex did not start switching the profile"));
    }
  });

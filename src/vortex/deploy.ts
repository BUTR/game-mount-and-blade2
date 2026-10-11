import { actions, selectors, types, util } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";

const isDeployNeeded = (state: types.IState): boolean =>
  state.persistent.deployment?.needToDeploy?.[GAME_ID] === true;

/**
 * Deploys the active profile and waits for deployment to finish.
 * Note that Vortex silently skips deployment if a tool it launched is currently running.
 */
export const deployModsAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  // Vortex's built-in wrapper for this event (available in Vortex 2.2+)
  const awaitModsDeployment = api.ext?.awaitModsDeployment;
  if (awaitModsDeployment !== undefined) {
    await awaitModsDeployment();
    return;
  }
  await util.toPromise<void>((cb) => api.events.emit("deploy-mods", cb));
};

/**
 * Replicates Vortex's pre-launch deployment behavior: deploys if the active profile has pending changes
 * that are not yet on disk, or waits for an existing automatic deployment to complete.
 */
export const ensureModsDeployedAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  if (isDeployNeeded(api.getState())) {
    await deployModsAsync(api);
    return;
  }
  await util.toPromise<void>((cb) => api.events.emit("await-activation", cb));
};

/**
 * Enables mods in a profile without triggering an automatic deployment.
 * Vortex marks deployment as necessary whenever any profile changes; for inactive profiles,
 * we revert that flag so the active profile is not redundantly re-deployed. The target profile
 * will be deployed when switched to.
 */
export const enableModsAsync = async (
  api: types.IExtensionApi,
  profileId: string,
  modIds: string[],
  options?: { installed?: boolean },
): Promise<void> => {
  const state = api.getState();
  const active = selectors.activeProfile(state)?.id === profileId;
  const deployNeeded = isDeployNeeded(state);
  await actions.setModsEnabled(api, profileId, modIds, true, {
    allowAutoDeploy: false,
    ...options,
  });
  if (!active && !deployNeeded) {
    api.store?.dispatch(actions.setDeploymentNecessary(GAME_ID, false));
  }
};

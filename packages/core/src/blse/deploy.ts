import { selectors, types } from "@nexusmods/vortex-api";
import path from "path";
import { LocalizationManager } from "../localization/manager";
import { enableModsAsync } from "../vortex/deploy";
import { getBinaryPath } from "../vortex/store";
import { installAndEnableDownloadAsync } from "../vortex/modDownloader";
import {
  checkBLSEDeploy,
  checkHarmonyDeploy,
  DeployModResult,
  DeployModStatus,
  deployModAsync,
} from "./modDeploy";
import {
  deployBLSEAsync,
  downloadBLSEAsync,
  downloadHarmonyAsync,
} from "./utils";
import { BLSE_CLI_EXE } from "../common";
import { getPathExistsAsync } from "../utils";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";

const sendDeployNotification = (
  api: types.IExtensionApi,
  id: string,
  title: string,
  message: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void,
): void => {
  api.sendNotification?.({
    id,
    type: "warning",
    title,
    message,
    actions: [
      {
        title: actionTitle,
        action,
      },
    ],
  });
};

/**
 * Runs the setup behind a notification button, reporting a failure instead of dropping it
 */
const runSetupAction = (
  api: types.IExtensionApi,
  setUp: (api: types.IExtensionApi) => Promise<void>,
  errorTitle: string,
  dismiss: types.NotificationDismiss,
): void => {
  void setUp(api)
    .catch((err: unknown) => {
      api.showErrorNotification?.(errorTitle, err, { allowReport: false });
    })
    .finally(() => dismiss());
};

const doBLSEDeploy = (
  api: types.IExtensionApi,
  blseResult: DeployModResult,
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const action = (dismiss: types.NotificationDismiss): void =>
    runSetupAction(api, setUpBLSEAsync, t("Failed to set up BLSE"), dismiss);

  switch (blseResult.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      sendDeployNotification(
        api,
        "blse-missing",
        t("BLSE is not installed via Vortex"),
        t("BLSE is recommended to mod Bannerlord."),
        t("Get BLSE"),
        action,
      );
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      sendDeployNotification(
        api,
        "blse-missing",
        t("BLSE is not installed"),
        t("BLSE is recommended to mod Bannerlord."),
        t("Install"),
        action,
      );
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      sendDeployNotification(
        api,
        "blse-missing",
        t("BLSE is not enabled"),
        t("BLSE is recommended to mod Bannerlord."),
        t("Enable"),
        action,
      );
      return;
    }
  }
};

const doHarmonyDeploy = (
  api: types.IExtensionApi,
  result: DeployModResult,
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const action = (dismiss: types.NotificationDismiss): void =>
    runSetupAction(
      api,
      setUpHarmonyAsync,
      t("Failed to set up Harmony"),
      dismiss,
    );

  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      sendDeployNotification(
        api,
        "harmony-missing",
        t("Harmony is not installed via Vortex"),
        t("Harmony is required for BLSE."),
        t("Get Harmony"),
        action,
      );
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      sendDeployNotification(
        api,
        "harmony-missing",
        t("Harmony is not installed"),
        t("Harmony is required for BLSE."),
        t("Install"),
        action,
      );
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      sendDeployNotification(
        api,
        "harmony-missing",
        t("Harmony is not enabled"),
        t("Harmony is required for BLSE."),
        t("Enable"),
        action,
      );
      return;
    }
  }
};

export const recommendBLSEAsync = async (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): Promise<void> => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  const state = api.getState<IStateWithBannerlord>();

  const profile = selectors.activeProfile(state);
  if (!profile) {
    return;
  }

  const mods = bselectors.bannerlordMods(state);
  const harmonyDeployResult = checkHarmonyDeploy(api, profile, mods);
  const blseDeployResult = checkBLSEDeploy(api, profile, mods);

  if (
    harmonyDeployResult.status !== DeployModStatus.OK &&
    blseDeployResult.status === DeployModStatus.OK
  ) {
    doHarmonyDeploy(api, harmonyDeployResult);
  }

  // skip if BLSE found
  // question: if the user incorrectly deleted BLSE and the binary is left, what should we do?
  // maybe just ask the user to always install BLSE via Vortex?
  const binaryPath = path.join(
    discovery.path,
    getBinaryPath(discovery.store),
    BLSE_CLI_EXE,
  );
  const binaryExists = await getPathExistsAsync(binaryPath);
  if (!binaryExists || blseDeployResult.status !== DeployModStatus.OK) {
    doBLSEDeploy(api, blseDeployResult);
  }
};

/**
 * Resolves mod deployment by downloading, installing, or enabling the mod as needed, followed by deployment.
 */
export const resolveModDeployAsync = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult,
  downloadFn: (api: types.IExtensionApi) => Promise<void>,
  deployFn: (api: types.IExtensionApi) => Promise<void>,
): Promise<void> => {
  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      await downloadFn(api);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      if (result.downloadId === undefined) {
        return;
      }
      // The archive has been downloaded; install and enable it before running deployment.
      await installAndEnableDownloadAsync(api, result.downloadId);
      await deployFn(api);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      if (result.modId === undefined) {
        return;
      }
      await enableModsAsync(api, profile.id, [result.modId]);
      await deployFn(api);
      return;
    }
  }
};

export const resolveHarmonyDeployAsync = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult,
): Promise<void> =>
  resolveModDeployAsync(
    api,
    profile,
    result,
    downloadHarmonyAsync,
    deployModAsync,
  );

/**
 * Evaluates the deployment status of BLSE in the active profile (returns OK when fully enabled).
 */
export const getBLSEDeployStatus = (
  api: types.IExtensionApi,
): DeployModStatus => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  if (!profile) {
    return DeployModStatus.OK;
  }
  return checkBLSEDeploy(api, profile, bselectors.bannerlordMods(state)).status;
};

/**
 * Downloads, installs or enables Harmony in the active profile as needed. Rejects when Harmony is still not in place
 */
export const setUpHarmonyAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  if (!profile) {
    return;
  }
  await resolveHarmonyDeployAsync(
    api,
    profile,
    checkHarmonyDeploy(api, profile, bselectors.bannerlordMods(state)),
  );

  // The download path reports its own failures without rejecting, so check the outcome
  const updatedState = api.getState<IStateWithBannerlord>();
  const updatedProfile = selectors.activeProfile(updatedState);
  if (
    updatedProfile &&
    checkHarmonyDeploy(
      api,
      updatedProfile,
      bselectors.bannerlordMods(updatedState),
    ).status !== DeployModStatus.OK
  ) {
    throw new Error("Harmony could not be set up");
  }
};

/**
 * Ensures all prerequisites for BLSE are satisfied in the active profile, resolving Harmony first.
 * Rejects without touching BLSE when Harmony could not be set up
 */
export const setUpBLSEAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await setUpHarmonyAsync(api);

  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  if (!profile) {
    return;
  }
  await resolveBLSEDeployAsync(
    api,
    profile,
    checkBLSEDeploy(api, profile, bselectors.bannerlordMods(state)),
  );
};

export const resolveBLSEDeployAsync = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult,
): Promise<void> =>
  resolveModDeployAsync(
    api,
    profile,
    result,
    downloadBLSEAsync,
    deployBLSEAsync,
  );

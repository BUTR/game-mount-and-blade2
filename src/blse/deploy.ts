import { actions, selectors, types } from "vortex-api";
import path from "path";
import { LocalizationManager } from "../localization";
import { getBinaryPath } from "../vortex";
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

const doBLSEDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  harmonyDeployResult: DeployModResult,
  blseResult: DeployModResult,
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  switch (blseResult.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        void resolveHarmonyDeployAsync(api, profile, harmonyDeployResult)
          .catch(() => {})
          .finally(async () => {
            await resolveBLSEDeployAsync(api, profile, blseResult)
              .catch(() => {})
              .finally(() => dismiss());
          });
      };
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
      const action = (dismiss: types.NotificationDismiss): void => {
        if (blseResult.downloadId === undefined) {
          return;
        }
        void resolveHarmonyDeployAsync(api, profile, harmonyDeployResult)
          .catch(() => {})
          .finally(async () => {
            await resolveBLSEDeployAsync(api, profile, blseResult)
              .catch(() => {})
              .finally(() => dismiss());
          });
      };
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
      const action = (dismiss: types.NotificationDismiss): void => {
        void resolveHarmonyDeployAsync(api, profile, harmonyDeployResult)
          .catch(() => {})
          .finally(async () => {
            if (blseResult.modId === undefined) {
              return;
            }
            await resolveBLSEDeployAsync(api, profile, blseResult)
              .catch(() => {})
              .finally(() => dismiss());
          });
      };
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
  profile: types.IProfile,
  result: DeployModResult,
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        resolveHarmonyDeployAsync(api, profile, result)
          .catch(() => {})
          .finally(() => dismiss());
      };
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
      const action = (dismiss: types.NotificationDismiss): void => {
        if (result.downloadId === undefined) {
          return;
        }
        api.events.emit("start-install-download", result.downloadId, {
          allowAutoEnable: true,
        });
        void resolveHarmonyDeployAsync(api, profile, result)
          .catch(() => {})
          .finally(() => dismiss());
      };
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
      const action = (dismiss: types.NotificationDismiss): void => {
        void resolveHarmonyDeployAsync(api, profile, result)
          .catch(() => {})
          .finally(() => dismiss());
      };
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
    doHarmonyDeploy(api, profile, harmonyDeployResult);
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
    doBLSEDeploy(api, profile, harmonyDeployResult, blseDeployResult);
  }
};

const resolveDeployAsync = async (
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
      await deployFn(api);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      if (result.modId === undefined) {
        return;
      }
      api.store?.dispatch(
        actions.setModEnabled(profile.id, result.modId, true),
      );
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
  resolveDeployAsync(
    api,
    profile,
    result,
    downloadHarmonyAsync,
    deployModAsync,
  );

export const resolveBLSEDeployAsync = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult,
): Promise<void> =>
  resolveDeployAsync(api, profile, result, downloadBLSEAsync, deployBLSEAsync);

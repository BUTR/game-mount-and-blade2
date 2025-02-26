import { selectors, types } from 'vortex-api';
import path from 'path';
import { LocalizationManager } from '../localization';
import {
  checkBLSEDeploy,
  checkHarmonyDeploy,
  DeployModResult,
  DeployModStatus,
  getBinaryPath,
  getPersistentBannerlordMods,
  installBLSE,
  installHarmony,
} from '../vortex';
import { BLSE_CLI_EXE } from '../common';
import { getPathExistsAsync } from '../utils';

const sendBLSENotification = (
  api: types.IExtensionApi,
  title: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.sendNotification?.({
    id: 'blse-missing',
    type: 'warning',
    title: title,
    message: t('BLSE is recommended to mod Bannerlord.'),
    actions: [
      {
        title: actionTitle,
        action: action,
      },
    ],
  });
};

const sendHarmonyNotification = (
  api: types.IExtensionApi,
  title: string,
  actionTitle: string,
  action: (dismiss: types.NotificationDismiss) => void
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.sendNotification?.({
    id: 'harmony-missing',
    type: 'warning',
    title: title,
    message: t('Harmony is required for BLSE.'),
    actions: [
      {
        title: actionTitle,
        action: action,
      },
    ],
  });
};

const doBLSEDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  harmonyDeployResult: DeployModResult,
  blseResult: DeployModResult
): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  switch (blseResult.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        installHarmony(api, profile, harmonyDeployResult)
          .catch(() => {})
          .finally(() => {
            installBLSE(api, profile, blseResult)
              .catch(() => {})
              .finally(() => dismiss());
          });
      };
      sendBLSENotification(api, t('BLSE is not installed via Vortex'), t('Get BLSE'), action);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        if (blseResult.downloadId === undefined) {
          return;
        }
        installHarmony(api, profile, harmonyDeployResult)
          .catch(() => {})
          .finally(() => {
            installBLSE(api, profile, blseResult)
              .catch(() => {})
              .finally(() => dismiss());
          });
      };
      sendBLSENotification(api, t('BLSE is not installed'), t('Install'), action);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        installHarmony(api, profile, harmonyDeployResult)
          .catch(() => {})
          .finally(() => {
            if (blseResult.modId === undefined) {
              return;
            }
            installBLSE(api, profile, blseResult)
              .catch(() => {})
              .finally(() => dismiss());
          });
      };
      sendBLSENotification(api, t('BLSE is not enabled'), t('Enable'), action);
      return;
    }
  }
};

const doHarmonyDeploy = (api: types.IExtensionApi, profile: types.IProfile, result: DeployModResult): void => {
  const { localize: t } = LocalizationManager.getInstance(api);

  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        installHarmony(api, profile, result)
          .catch(() => {})
          .finally(() => dismiss());
      };
      sendHarmonyNotification(api, t('Harmony is not installed via Vortex'), t('Get Harmony'), action);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        if (result.downloadId === undefined) {
          return;
        }
        api.events.emit('start-install-download', result.downloadId, {
          allowAutoEnable: true,
        });
        installHarmony(api, profile, result)
          .catch(() => {})
          .finally(() => dismiss());
      };
      sendHarmonyNotification(api, t('Harmony is not installed'), t('Install'), action);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      const action = (dismiss: types.NotificationDismiss): void => {
        installHarmony(api, profile, result)
          .catch(() => {})
          .finally(() => dismiss());
      };
      sendHarmonyNotification(api, t('Harmony is not enabled'), t('Enable'), action);
      return;
    }
  }
};

export const recommendBLSE = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  const state = api.getState();
  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  const mods = getPersistentBannerlordMods(state.persistent);

  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  const harmonyDeployResult = checkHarmonyDeploy(api, profile, mods);
  const blseDeployResult = checkBLSEDeploy(api, profile, mods);

  if (harmonyDeployResult.status !== DeployModStatus.OK && blseDeployResult.status === DeployModStatus.OK) {
    doHarmonyDeploy(api, profile, harmonyDeployResult);
  }

  // skip if BLSE found
  // question: if the user incorrectly deleted BLSE and the binary is left, what should we do?
  // maybe just ask the user to always install BLSE via Vortex?
  const binaryPath = path.join(discovery.path, getBinaryPath(discovery.store), BLSE_CLI_EXE);
  const binaryExists = await getPathExistsAsync(binaryPath);
  if (!binaryExists || blseDeployResult.status !== DeployModStatus.OK) {
    doBLSEDeploy(api, profile, harmonyDeployResult, blseDeployResult);
  }
};

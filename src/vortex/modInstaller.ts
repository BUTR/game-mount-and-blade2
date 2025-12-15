import { actions, types } from "vortex-api";
import {
  deployBLSEAsync,
  downloadBLSEAsync,
  downloadHarmonyAsync,
} from "../blse";
import { deployModAsync, DeployModResult, DeployModStatus } from "../vortex";

export const installHarmonyAsync = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult,
): Promise<void> => {
  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      await downloadHarmonyAsync(api);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      await deployModAsync(api);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      if (result.modId === undefined) {
        return;
      }
      api.store?.dispatch(
        actions.setModEnabled(profile.id, result.modId, true),
      );
      await deployModAsync(api);
      return;
    }
  }
};

export const installBLSEAsync = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult,
): Promise<void> => {
  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      await downloadBLSEAsync(api);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      await deployBLSEAsync(api);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      if (result.modId === undefined) {
        return;
      }
      api.store?.dispatch(
        actions.setModEnabled(profile.id, result.modId, true),
      );
      await deployBLSEAsync(api);
      return;
    }
  }
};

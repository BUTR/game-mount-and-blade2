import { actions, types } from 'vortex-api';
import { deployBLSE, downloadBLSE, downloadHarmony } from '../blse';
import { deployMod, DeployModResult, DeployModStatus } from '../vortex';

export const installHarmony = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult
): Promise<void> => {
  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      await downloadHarmony(api);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      await deployMod(api);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      if (result.modId === undefined) {
        return;
      }
      api.store?.dispatch(actions.setModEnabled(profile.id, result.modId, true));
      await deployMod(api);
      return;
    }
  }
};

export const installBLSE = async (
  api: types.IExtensionApi,
  profile: types.IProfile,
  result: DeployModResult
): Promise<void> => {
  switch (result.status) {
    case DeployModStatus.OK:
      return;
    case DeployModStatus.NOT_DOWNLOADED: {
      await downloadBLSE(api);
      return;
    }
    case DeployModStatus.NOT_INSTALLED: {
      await deployBLSE(api);
      return;
    }
    case DeployModStatus.NOT_ENABLED: {
      if (result.modId === undefined) {
        return;
      }
      api.store?.dispatch(actions.setModEnabled(profile.id, result.modId, true));
      await deployBLSE(api);
      return;
    }
  }
};

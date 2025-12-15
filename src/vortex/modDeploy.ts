import { types, util } from "vortex-api";
import { findMod, findModDownload, isModActive } from "./modFinder";
import { IBannerlordModStorage } from "../types";
import { findBLSEDownload, findBLSEMod } from "../blse";
import { HARMONY_MOD_ID } from "../common";

export enum DeployModStatus {
  OK,
  NOT_DOWNLOADED,
  NOT_INSTALLED,
  NOT_ENABLED,
}

export type DeployModResult = {
  status: DeployModStatus;
  modId?: string | undefined;
  downloadId?: string | undefined;
};

export const checkBLSEDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  mods: IBannerlordModStorage,
): DeployModResult => {
  const blseMod = findBLSEMod(mods);
  if (blseMod) {
    // Found but not enabled
    const blseIsActive = isModActive(profile, blseMod);
    if (!blseIsActive) {
      return {
        status: DeployModStatus.NOT_ENABLED,
        modId: blseMod.id,
      };
    }
  } else {
    const blseDownload = findBLSEDownload(api);
    if (blseDownload !== undefined) {
      // Downloaded but not installed
      return {
        status: DeployModStatus.NOT_INSTALLED,
        downloadId: blseDownload,
      };
    } else {
      // Non existent
      return {
        status: DeployModStatus.NOT_DOWNLOADED,
      };
    }
  }
  return {
    status: DeployModStatus.OK,
  };
};

export const checkHarmonyDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  mods: IBannerlordModStorage,
): DeployModResult => {
  const harmonyMod = findMod(mods, "Bannerlord.Harmony");
  if (harmonyMod) {
    // Found but not enabled
    const harmonyIsActive = isModActive(profile, harmonyMod);
    if (!harmonyIsActive) {
      return {
        status: DeployModStatus.NOT_ENABLED,
        modId: harmonyMod.id,
      };
    }
  } else {
    const harmonyDownload = findModDownload(api, HARMONY_MOD_ID);
    if (harmonyDownload !== undefined) {
      // Downloaded but not installed
      return {
        status: DeployModStatus.NOT_INSTALLED,
        downloadId: harmonyDownload,
      };
    } else {
      // Non existent
      return {
        status: DeployModStatus.NOT_DOWNLOADED,
      };
    }
  }
  return {
    status: DeployModStatus.OK,
  };
};

export const deployModAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await util.toPromise((cb) => api.events.emit("deploy-mods", cb));
  await util.toPromise((cb) =>
    api.events.emit("start-quick-discovery", () => cb(null)),
  );
};

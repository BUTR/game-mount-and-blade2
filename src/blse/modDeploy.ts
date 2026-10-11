import { types, util } from "vortex-api";
import { deployModsAsync } from "../vortex/deploy";
import { findModDownload } from "../vortex/modFinder";
import { findMod, isModActive } from "../vortex/modStorage";
import { IBannerlordMod, IBannerlordModStorage } from "../types";
import { findBLSEDownload } from "./utils";
import { findBLSEMod } from "./modType";
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

/**
 * What a mod still needs in the profile: a download, an install or enabling. OK when it is enabled
 */
export const checkModDeploy = (
  profile: types.IProfile,
  mod: IBannerlordMod | undefined,
  downloadId: string | undefined,
): DeployModResult => {
  if (mod) {
    if (!isModActive(profile, mod)) {
      return { status: DeployModStatus.NOT_ENABLED, modId: mod.id };
    }
  } else {
    if (downloadId !== undefined) {
      return { status: DeployModStatus.NOT_INSTALLED, downloadId };
    } else {
      return { status: DeployModStatus.NOT_DOWNLOADED };
    }
  }
  return { status: DeployModStatus.OK };
};

export const checkBLSEDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  mods: IBannerlordModStorage,
): DeployModResult => {
  return checkModDeploy(profile, findBLSEMod(mods), findBLSEDownload(api));
};

export const checkHarmonyDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  mods: IBannerlordModStorage,
): DeployModResult => {
  return checkModDeploy(
    profile,
    findMod(mods, "Bannerlord.Harmony"),
    findModDownload(api, HARMONY_MOD_ID),
  );
};

export const deployModAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  await deployModsAsync(api);
  await util.toPromise((cb) =>
    api.events.emit("start-quick-discovery", () => cb(null)),
  );
};

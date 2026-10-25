import path from "path";
import { util } from "@nexusmods/vortex-api";
import { FetchBannerlordVersion } from "@butr/vortexextensionnative";
import { GAME_ID } from "@bannerlord/core/common";
import {
  formatVersion,
  getBuildVersionAsync as getRegistryVersionAsync,
} from "@bannerlord/build-versions";
import { VerifyStore } from "./types";

/**
 * The game version of a store's build, from BUTR's registry kept in Vortex's data. Undefined for a build it doesn't
 * know yet
 */
export const getBuildVersionAsync = (
  store: VerifyStore,
  buildId: string,
): Promise<string | undefined> =>
  getRegistryVersionAsync(store, buildId, {
    cachePath: path.join(
      util.getVortexPath("userData"),
      GAME_ID,
      "build-versions.json",
    ),
  });

/**
 * The version of the game installed in the folder, from its files, for a build the registry doesn't know yet
 */
export const getInstalledVersion = (gamePath: string): string | undefined => {
  try {
    const library = "TaleWorlds.Library.dll";
    const version = FetchBannerlordVersion.getVersion(gamePath, library);
    const changeSet = FetchBannerlordVersion.getChangeSet(gamePath, library);
    return version !== "" && changeSet > 0
      ? formatVersion(version, changeSet)
      : undefined;
  } catch {
    return undefined;
  }
};

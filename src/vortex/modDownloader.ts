import { selectors, types, util } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";
import { enableModsAsync } from "./deploy";
import { findModDownload } from "./modFinder";

export const downloadAndEnableLatestModVersionAsync = (
  api: types.IExtensionApi,
  modId: number,
): Promise<void> => downloadAndEnableModFileAsync(api, modId, null);

/**
 * Downloads a mod file from Nexus Mods, installs it, and enables it in a profile without deploying.
 * If the file was downloaded previously, it is installed directly from the existing download.
 *
 * @param fileId The mod file ID to retrieve, or null for the mod's latest main file.
 * @param profileId The target profile ID in which to enable the mod (defaults to the active profile).
 */
export const downloadAndEnableModFileAsync = async (
  api: types.IExtensionApi,
  modId: number,
  fileId: number | null,
  profileId?: string,
): Promise<void> => {
  const modFiles = (await api.ext.nexusGetModFiles?.(GAME_ID, modId)) ?? [];

  // Sort by numeric timestamp (uploaded_time is an ISO date string)
  const files = modFiles
    .filter((file) => file?.category_id === 1)
    .sort((lhs, rhs) => lhs.uploaded_timestamp - rhs.uploaded_timestamp);
  const file =
    fileId !== null
      ? modFiles.find((candidate) => candidate?.file_id === fileId)
      : files[files.length - 1];

  if (!file) {
    throw new util.ProcessCanceled(
      fileId !== null
        ? `File ${fileId} of mod ${modId} not found`
        : `No mod ${modId} main file found`,
    );
  }

  const existing = findModDownload(api, modId, file.file_id);
  if (existing !== undefined) {
    await installAndEnableDownloadAsync(api, existing, profileId);
    return;
  }

  const dlInfo = {
    game: GAME_ID,
    name: file.name,
  };

  const nxmUrl = `nxm://${GAME_ID}/mods/${modId}/files/${file.file_id}`;
  const dlId = await util.toPromise<string>((cb) =>
    api.events.emit(
      "start-download",
      [nxmUrl],
      dlInfo,
      undefined,
      cb,
      undefined,
      { allowInstall: false },
    ),
  );
  await installAndEnableDownloadAsync(api, dlId, profileId);
};

/**
 * Installs an existing download and enables the mod in a profile without deploying.
 *
 * @param profileId The profile to enable the mod in (defaults to the active profile).
 */
export const installAndEnableDownloadAsync = async (
  api: types.IExtensionApi,
  downloadId: string,
  profileId?: string,
): Promise<void> => {
  const targetId = profileId ?? selectors.activeProfile(api.getState())?.id;
  if (targetId === undefined) {
    throw new Error(`Active profile is undefined`);
  }
  // Passing profileId ensures a reinstall checks the target profile's state instead of the active profile's.
  // Not yet included in vortex-api typings; older Vortex versions ignore it.
  const installOptions: { allowAutoEnable: boolean; profileId: string } = {
    allowAutoEnable: false,
    profileId: targetId,
  };
  const modId = await util.toPromise<string>((cb) =>
    api.events.emit("start-install-download", downloadId, installOptions, cb),
  );
  await enableModsAsync(api, targetId, [modId], { installed: true });
};

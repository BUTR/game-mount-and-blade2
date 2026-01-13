import { actions, selectors, types, util } from "vortex-api";
import { IFileInfo } from "@nexusmods/nexus-api/lib";
import { GAME_ID } from "../common";

export const downloadAndEnableLatestModVersionAsync = async (
  api: types.IExtensionApi,
  modId: number,
): Promise<void> => {
  const modFiles = (await api.ext.nexusGetModFiles?.(GAME_ID, modId)) ?? [];

  const fileTime = (input: IFileInfo): number =>
    Number.parseInt(input.uploaded_time, 10);

  const files = modFiles
    .filter((file) => file?.category_id === 1)
    .sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs));
  const file = files.length > 0 ? files[files.length - 1] : undefined;

  if (!file) {
    throw new util.ProcessCanceled(`No mod ${modId} main file found`);
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
  const modIdToDownload = await util.toPromise<string>((cb) =>
    api.events.emit(
      "start-install-download",
      dlId,
      { allowAutoEnable: false },
      cb,
    ),
  );
  const profile = selectors.activeProfile(api.getState());
  if (!profile) {
    throw new Error(`Active profile is undefined`);
  }
  await actions.setModsEnabled(api, profile.id, [modIdToDownload], true, {
    allowAutoDeploy: false,
    installed: true,
  });
};

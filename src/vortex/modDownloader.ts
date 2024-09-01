import { actions, selectors, types, util } from 'vortex-api';
import { IFileInfo } from '@nexusmods/nexus-api/lib';
import { GAME_ID } from '../common';

export const downloadAndEnableLatestModVersion = async (api: types.IExtensionApi, modId: number): Promise<void> => {
  const modFiles = (await api.ext.nexusGetModFiles?.(GAME_ID, modId)) ?? [];

  const fileTime = (input: IFileInfo): number => Number.parseInt(input.uploaded_time, 10);

  const file = modFiles.filter((file) => file.category_id === 1).sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs))[0];

  if (!file) {
    throw new util.ProcessCanceled(`No mod ${modId} main file found`);
  }

  const dlInfo = {
    game: GAME_ID,
    name: file.name,
  };

  const nxmUrl = `nxm://${GAME_ID}/mods/${modId}/files/${file.file_id}`;
  const dlId = await util.toPromise<string>((cb) =>
    api.events.emit('start-download', [nxmUrl], dlInfo, undefined, cb, undefined, { allowInstall: false })
  );
  const modIdToDownload = await util.toPromise<string>((cb) =>
    api.events.emit('start-install-download', dlId, { allowAutoEnable: false }, cb)
  );
  const profile: types.IProfile | undefined = selectors.activeProfile(api.getState());
  await actions.setModsEnabled(api, profile.id, [modIdToDownload], true, {
    allowAutoDeploy: false,
    installed: true,
  });
};

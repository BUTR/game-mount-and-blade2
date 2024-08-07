import { gte } from 'semver';
import { actions, selectors, types, util } from 'vortex-api';
import { IFileInfo } from '@nexusmods/nexus-api/lib';
import { BLSE_MOD_ID, BLSE_URL, GAME_ID } from '../common';
import { hasPersistentBannerlordMods } from '../vortex';
import { LocalizationManager } from '../localization';
import { IBannerlordMod, IBannerlordModStorage } from '../types';

export const isModActive = (profile: types.IProfile, mod: IBannerlordMod): boolean => {
  return profile.modState[mod.id]?.enabled ?? false;
};
const isModBLSE = (mod: IBannerlordMod): boolean => {
  return mod.type === `bannerlord-blse` || (mod.attributes?.modId === 1 && mod.attributes?.source === `nexus`);
};

export const findBLSEMod = (mods: IBannerlordModStorage): IBannerlordMod | undefined => {
  const blseMods: IBannerlordMod[] = Object.values(mods).filter((mod: IBannerlordMod) => isModBLSE(mod));

  if (blseMods.length === 0) return undefined;

  if (blseMods.length === 1) return blseMods[0];

  return blseMods.reduce<IBannerlordMod | undefined>((prev: IBannerlordMod | undefined, iter: IBannerlordMod) => {
    if (!prev) {
      return iter;
    }
    return gte(iter.attributes?.version ?? '0.0.0', prev.attributes?.version ?? '0.0.0') ? iter : prev;
  }, undefined);
};

export const findBLSEDownload = (api: types.IExtensionApi): string | undefined => {
  const state = api.getState();
  const downloadedFiles = state.persistent.downloads.files;
  if (downloadedFiles === undefined) {
    return undefined;
  }

  const blseFiles = Object.entries(downloadedFiles)
    .filter(([, download]) => download.game.includes(GAME_ID))
    .filter(([, download]) => download.modInfo?.['nexus']?.modInfo?.mod_id === 1)
    .sort(([, downloadA], [, downloadB]) => downloadA.fileTime - downloadB.fileTime);

  if (blseFiles.length === 0) {
    return undefined;
  }

  const [downloadId, download] = blseFiles[0]!;

  return downloadId;
};

export const isActiveBLSE = (api: types.IExtensionApi): boolean => {
  const state = api.getState();

  if (!hasPersistentBannerlordMods(state.persistent)) return false;

  const mods = state.persistent.mods.mountandblade2bannerlord ?? {};
  const blseMods: IBannerlordMod[] = Object.values(mods).filter((mod: IBannerlordMod) => isModBLSE(mod));

  if (blseMods.length === 0) {
    return false;
  }

  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  return blseMods.filter((x) => isModActive(profile, x)).length >= 1;
};

export const deployBLSE = async (api: types.IExtensionApi): Promise<void> => {
  await util.toPromise((cb) => api.events.emit('deploy-mods', cb));
  await util.toPromise((cb) => api.events.emit('start-quick-discovery', () => cb(null)));

  const discovery: types.IDiscoveryResult | undefined = selectors.currentGameDiscovery(api.getState());
  const tool = discovery?.tools?.['blse-cli'];
  if (tool) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, tool.id));
  }
};

export const downloadBLSE = async (api: types.IExtensionApi, shouldUpdate: boolean = false): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.dismissNotification?.('blse-missing');
  api.sendNotification?.({
    id: 'blse-installing',
    message: shouldUpdate ? t('Updating BLSE') : t('Installing BLSE'),
    type: 'activity',
    noDismiss: true,
    allowSuppress: false,
  });

  await api.ext?.ensureLoggedIn?.();

  try {
    const modFiles = (await api.ext.nexusGetModFiles?.(GAME_ID, BLSE_MOD_ID)) ?? [];

    const fileTime = (input: IFileInfo): number => Number.parseInt(input.uploaded_time, 10);

    const file = modFiles.filter((file) => file.category_id === 1).sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs))[0];

    if (!file) {
      throw new util.ProcessCanceled('No BLSE main file found');
    }

    const dlInfo = {
      game: GAME_ID,
      name: 'BLSE',
    };

    const nxmUrl = `nxm://${GAME_ID}/mods/${BLSE_MOD_ID}/files/${file.file_id}`;
    const dlId = await util.toPromise<string>((cb) =>
      api.events.emit('start-download', [nxmUrl], dlInfo, undefined, cb, undefined, { allowInstall: false })
    );
    const modId = await util.toPromise<string>((cb) =>
      api.events.emit('start-install-download', dlId, { allowAutoEnable: false }, cb)
    );
    const profile: types.IProfile | undefined = selectors.activeProfile(api.getState());
    await actions.setModsEnabled(api, profile.id, [modId], true, {
      allowAutoDeploy: false,
      installed: true,
    });

    await deployBLSE(api);
  } catch (err) {
    api.showErrorNotification?.(t('Failed to download/install BLSE'), err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.('blse-installing');
  }
};

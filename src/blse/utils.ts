import { actions, selectors, types, util } from 'vortex-api';
import { BannerlordModuleManager } from '@butr/vortexextensionnative';
import { BLSE_MOD_ID, BLSE_URL, GAME_ID, HARMONY_MOD_ID } from '../common';
import { downloadAndEnableLatestModVersionAsync, hasPersistentBannerlordMods } from '../vortex';
import { LocalizationManager } from '../localization';
import { IBannerlordMod, IBannerlordModStorage } from '../types';

const isModActive = (profile: types.IProfile, mod: IBannerlordMod): boolean => {
  // Warning: modState is not guaranteed to be present in the profile
  return profile.modState?.[mod.id]?.enabled ?? false;
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
    const compareResult = BannerlordModuleManager.compareVersions(
      BannerlordModuleManager.parseApplicationVersion(iter.attributes?.version ?? ''),
      BannerlordModuleManager.parseApplicationVersion(prev.attributes?.version ?? '')
    );
    switch (compareResult) {
      case 1:
        return iter;
      case -1:
        return prev;
      default:
        return iter;
    }
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

export const deployBLSEAsync = async (api: types.IExtensionApi): Promise<void> => {
  await util.toPromise((cb) => api.events.emit('deploy-mods', cb));
  await util.toPromise((cb) => api.events.emit('start-quick-discovery', () => cb(null)));

  const discovery: types.IDiscoveryResult | undefined = selectors.currentGameDiscovery(api.getState());
  const tool = discovery?.tools?.['blse-cli'];
  if (tool) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, tool.id));
  }
};

export const downloadBLSEAsync = async (api: types.IExtensionApi, shouldUpdate: boolean = false): Promise<void> => {
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
    await downloadAndEnableLatestModVersionAsync(api, BLSE_MOD_ID);

    await deployBLSEAsync(api);
  } catch (err) {
    api.showErrorNotification?.(t('Failed to download/install BLSE'), err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.('blse-installing');
  }
};

export const downloadHarmonyAsync = async (api: types.IExtensionApi, shouldUpdate: boolean = false): Promise<void> => {
  const { localize: t } = LocalizationManager.getInstance(api);

  api.dismissNotification?.('harmony-missing');
  api.sendNotification?.({
    id: 'harmony-installing',
    message: shouldUpdate ? t('Updating Harmony') : t('Installing Harmony'),
    type: 'activity',
    noDismiss: true,
    allowSuppress: false,
  });

  await api.ext?.ensureLoggedIn?.();

  try {
    await downloadAndEnableLatestModVersionAsync(api, HARMONY_MOD_ID);
  } catch (err) {
    api.showErrorNotification?.(t('Failed to download/install Harmony'), err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.('harmony-installing');
  }
};

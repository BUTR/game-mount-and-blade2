import { selectors, types } from 'vortex-api';
import { collectionInstallBLSE } from './utils';
import { GAME_ID } from '../common';
import {
  hasBackupModOptions,
  overrideModOptions,
  removeOriginalModOptions,
  restoreOriginalModOptions,
} from '../modoptions';
import { LocalizationManager } from '../localization';
import { hasPersistentBannerlord, hasPersistentBannerlordMods } from '../vortex';
import { actionsLoadOrder, orderCurrentLoadOrderByExternalLoadOrder } from '../loadOrder';
import { VortexLauncherManager } from '../launcher';
import { IBannerlordMod } from '../types';

/**
 * Event function, be careful
 * We're a bit inconsistent - when the mod is enabled, we don't react
 * We're waiting for the deployment to trigger
 * On disable, we're reacting immediately
 */
export const didDeployCollection = async (api: types.IExtensionApi, profileId: string): Promise<void> => {
  const state = api.getState();

  const profile: types.IProfile | undefined = selectors.profileById(state, profileId);
  if (profile === undefined || profile.gameId !== GAME_ID) {
    return;
  }

  if (!hasPersistentBannerlordMods(state.persistent)) {
    return;
  }

  const enabledCollections = Object.values(state.persistent.mods.mountandblade2bannerlord)
    .filter((mod) => mod.type === 'collection')
    .filter((mod) => profile.modState[mod.id]?.enabled);

  for (const collection of enabledCollections) {
    await modEnabledCollection(api, profileId, collection);
  }
};

const modEnabledCollection = async (
  api: types.IExtensionApi,
  profileId: string,
  mod: IBannerlordMod
): Promise<void> => {
  const state = api.getState();

  if (!hasPersistentBannerlord(state.persistent)) {
    return;
  }

  const collectionSlug = mod.attributes?.['collectionSlug'];
  if (collectionSlug === undefined || typeof collectionSlug !== 'string') {
    return;
  }

  const collectionGeneralData = state.persistent.mountandblade2bannerlord.collectionGeneralData[collectionSlug];
  if (collectionGeneralData !== undefined) {
    const { hasBLSE, suggestedLoadOrder } = collectionGeneralData;

    if (hasBLSE) {
      await collectionInstallBLSE(api);
    }

    const launcherManager = VortexLauncherManager.getInstance(api);
    const modules = launcherManager.getAllModules();
    const loadOrder = await orderCurrentLoadOrderByExternalLoadOrder(api, modules, suggestedLoadOrder);
    api.store?.dispatch(actionsLoadOrder.setFBLoadOrder(profileId, loadOrder));
  }

  const collectionModOptions = state.persistent.mountandblade2bannerlord.collectionModOptions[collectionSlug];
  if (collectionModOptions !== undefined) {
    const { includedModOptions } = collectionModOptions;

    if (includedModOptions !== undefined && includedModOptions.length) {
      const localizationManager = LocalizationManager.getInstance(api);
      const { localize: t } = localizationManager;

      const no = t('No');
      const yes = t('Yes');
      const result = await api.showDialog?.(
        'question',
        t('Override Mod Options'),
        {
          message: t(
            `This collection contains custom Mod Options (MCM)!
    Do you want to override your Mod Options with the custom Mod Options?
    A backup of your original Mod Options will be kept and will be restored on collection removal.`
          ),
        },
        [{ label: no }, { label: yes }]
      );

      if (result && result.action === yes) {
        await overrideModOptions(mod, includedModOptions);
      }
    }
  }
};

/**
 * Event function, be careful
 * We're a bit inconsistent - when the mod is enabled, we don't react
 * We're waiting for the deployment to trigger
 * On disable, we're reacting immediately
 */
export const modDisabledCollections = async (api: types.IExtensionApi, modId: string): Promise<void> => {
  const state = api.getState();

  const mod = state.persistent.mods[GAME_ID]?.[modId];
  if (!mod) {
    return;
  }
  if (mod.type !== 'collection') {
    return;
  }

  if (!(await hasBackupModOptions(mod))) {
    return;
  }

  const localizationManager = LocalizationManager.getInstance(api);
  const { localize: t } = localizationManager;

  const deleteOriginals = t('Delete Originals');
  const restoreOriginals = t('Restore Originals');
  const cancel = t('Cancel');
  const result = await api.showDialog?.(
    'question',
    t('Restore Original Mod Options'),
    {
      message: t(
        `The removed collection contained custom Mod Options (MCM)!
Do you want to restore your original Mod Options if they were overriden by the collection?`
      ),
    },
    [{ label: deleteOriginals }, { label: restoreOriginals }, { label: cancel }]
  );

  if (!result || result.action === cancel) {
    return;
  }

  if (result.action === deleteOriginals) {
    await removeOriginalModOptions(mod);
  }

  if (result.action === restoreOriginals) {
    await restoreOriginalModOptions(mod);
  }
};

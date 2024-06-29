import { types } from 'vortex-api';
import { GAME_ID } from '../common';
import { hasBackupModOptions, removeOriginalModOptions, restoreOriginalModOptions } from '../modoptions';
import { LocalizationManager } from '../localization';

/**
 * Event function, be careful
 */
export const willRemoveModCollections = async (api: types.IExtensionApi, modId: string): Promise<void> => {
  const mod = api.getState().persistent.mods[GAME_ID]?.[modId];
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

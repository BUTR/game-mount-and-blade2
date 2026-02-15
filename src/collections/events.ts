import { types } from "vortex-api";
import {
  hasBackupModOptionsAsync,
  removeOriginalModOptionsAsync,
  restoreOriginalModOptionsAsync,
} from "../modoptions";
import { LocalizationManager } from "../localization";
import { bselectors } from "../selectors";
import { IStateWithBannerlord } from "../types";

/**
 * Event function, be careful
 */
export const willRemoveModCollectionsAsync = async (
  api: types.IExtensionApi,
  modId: string,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  const mod = bselectors.bannerlordModById(state, modId);
  if (!mod) {
    return;
  }
  if (mod.type !== "collection") {
    return;
  }

  if (!(await hasBackupModOptionsAsync(mod))) {
    return;
  }

  const localizationManager = LocalizationManager.getInstance(api);
  const { localize: t } = localizationManager;

  const deleteOriginals = t("Delete Originals");
  const restoreOriginals = t("Restore Originals");
  const cancel = t("Cancel");
  const result = await api.showDialog?.(
    "question",
    t("Restore Original Mod Options"),
    {
      message: t(
        `The removed collection contained custom Mod Options (MCM)!
Do you want to restore your original Mod Options if they were overriden by the collection?`,
      ),
    },
    [
      { label: deleteOriginals },
      { label: restoreOriginals },
      { label: cancel },
    ],
  );

  if (!result || result.action === cancel) {
    return;
  }

  if (result.action === deleteOriginals) {
    await removeOriginalModOptionsAsync(mod);
  }

  if (result.action === restoreOriginals) {
    await restoreOriginalModOptionsAsync(mod);
  }
};

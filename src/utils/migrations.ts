import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import path from 'path';
import semver from 'semver';
import {
  types, actions, selectors, util,
} from 'vortex-api';
import walk, { IEntry } from 'turbowalk';
import { GAME_ID, SUBMOD_FILE, I18N_NAMESPACE } from '../common';
import { IMods } from '../types';
import { getXMLData } from './util';

const addSubModsAttrib = async (api: types.IExtensionApi, mod: types.IMod): Promise<void> => {
  // Not sure how this would happen.
  if (!mod) return;

  const state = api.getState();
  const stagingFolder: string = selectors.installPathForGame(state, GAME_ID);
  const modPath = path.join(stagingFolder, mod.installationPath);
  let allEntries = Array<IEntry>();
  const progres = (e: IEntry[]): void => {
    allEntries = allEntries.concat(e.filter((entry) => path.basename(entry.filePath).toLowerCase() === SUBMOD_FILE));
  };
  await walk(modPath, progres, { skipInaccessible: true, recurse: true, skipLinks: true }).catch(() => []);

  if (allEntries.length > 1) {
    let subModules = await Promise.all(allEntries.map(async (entry) => {
      try {
        const data: any = await getXMLData(entry.filePath);
        const subModuleId: string = data.get(`//Id`).attr(`value`).value();
        return subModuleId;
      } catch (err) {
        // Ignore errors for this migration.
        return undefined;
      }
    }));
    // Remove any invalid modules
    subModules = subModules.filter((id) => !!id);
    api.store?.dispatch(actions.setModAttribute(GAME_ID, mod.id, `subModIds`, subModules));
  }
};

export const migrate045 = toBluebird<void, types.IExtensionApi, string>(async (api: types.IExtensionApi, oldVersion: string): Promise<void> => {
  if (semver.gte(oldVersion, `0.4.5`)) return;

  await api.awaitUI();
  const state = api.getState();
  const activeGameId = selectors.activeGameId(state);
  if (activeGameId !== GAME_ID) return;

  api.sendNotification?.({
    id: `mnb2-045-migration`,
    type: `info`,
    message: api.translate(`Bannerlord - Important Information`, { ns: I18N_NAMESPACE }),
    noDismiss: true,
    actions: [{
      title: `More`,
      action: (dismiss_1): void => {
        dismiss_1();
        api.showDialog?.(`info`, `Mount and Blade II: Bannerlord`, {
          bbcode: api.translate(`We've added the option to auto sort your modules whenever ` +
            `a deployment event occurrs - this functionality is configured to ` +
            `function on a per profile basis and should ensure that the modules ` +
            `are always sorted correctly when you launch the game.[br][/br][br][/br]` +
            `Please note: this new feature is enabled by default; if for any reason ` +
            `you wish to disable it, you can do so from the Interface tab in the Settings page`),
        }, [{ label: `Close` }]);
      },
    }],
  });
});

export const migrate026 = toBluebird<void, types.IExtensionApi, string>(async (api: types.IExtensionApi, oldVersion: string): Promise<void> => {
  if (semver.gte(oldVersion, `0.2.6`)) return;

  const state = api.getState();
  const mods = util.getSafe<IMods>(state, [`persistent`, `mods`, GAME_ID], {});
  await Promise.all(Object.values(mods).map((mod) => addSubModsAttrib(api, mod)));
});

//@ts-ignore
import { Promise } from "bluebird";
import { method as toBluebird } from "bluebird"

import path from 'path';
import semver from 'semver';
import { types } from 'vortex-api';
import { parseStringPromise } from 'xml2js';
import walk, { IEntry } from 'turbowalk';

const { actions, fs, selectors, util } = require('vortex-api');

const { GAME_ID, SUBMOD_FILE, I18N_NAMESPACE } = require('./common');

export const migrate045 = toBluebird(async (api: types.IExtensionApi, oldVersion: string): Promise<any> => {
  if (semver.gte(oldVersion, '0.4.5')) {
    return Promise.resolve();
  }

  await api.awaitUI();
  const state = api.getState();
  const activeGameId = selectors.activeGameId(state);
  if (activeGameId !== GAME_ID) {
    return Promise.resolve();
  }
  api.sendNotification?.({
    id: 'mnb2-045-migration',
    type: 'info',
    message: api.translate('Bannerlord - Important Information', { ns: I18N_NAMESPACE }),
    noDismiss: true,
    actions: [
      {
        title: 'More',
        action: (dismiss_1) => {
          dismiss_1();
          api.showDialog?.('info', 'Mount and Blade II: Bannerlord', {
            bbcode: api.translate('We\'ve added the option to auto sort your modules whenever '
              + 'a deployment event occurrs - this functionality is configured to '
              + 'function on a per profile basis and should ensure that the modules '
              + 'are always sorted correctly when you launch the game.[br][/br][br][/br]'
              + 'Please note: this new feature is enabled by default; if for any reason '
              + 'you wish to disable it, you can do so from the Interface tab in the Settings page'),
          }, [
            { label: 'Close' },
          ]);
        },
      },
    ],
  });
  return await Promise.resolve();
});

export const migrate026 = toBluebird(async (api: types.IExtensionApi, oldVersion: string): Promise<any> => {
  if (semver.gte(oldVersion, '0.2.6')) {
    return;
  }

  const state = api.getState();
  const mods: { [key: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  await Promise.all(Object.values(mods).map(mod => addSubModsAttrib(api, mod)));
});

async function addSubModsAttrib(api: types.IExtensionApi, mod: types.IMod): Promise<void> {
  // Not sure how this would happen.
  if (!mod) return Promise.resolve();

  const state = api.getState();
  const stagingFolder: string = selectors.installPathForGame(state, GAME_ID);
  const modPath = path.join(stagingFolder, mod.installationPath);
  let allEntries: IEntry[] = []; 
  await walk(modPath, entries => {
    allEntries = allEntries.concat(entries.filter(entry => path.basename(entry.filePath).toLowerCase() === SUBMOD_FILE));
  }, { skipInaccessible: true, recurse: true, skipLinks: true }).catch(() => []);
  if (allEntries.length > 1) {
    let subModules: string[] = await Promise.all(allEntries.map(async entry => {
      try {
        const data = await getXMLData(entry.filePath);
        const subModuleId = data.get('//Id').attr('value').value();
        return subModuleId;
      }
      catch(err) {
        // Ignore errors for this migration.
        return undefined;
      }
    }));
    // Remove any invalid modules
    subModules = subModules.filter(id => !!id);
    api.store?.dispatch(actions.setModAttribute(GAME_ID, mod.id, 'subModIds', subModules));
    return Promise.resolve();
  }
  else return Promise.resolve();
}

async function getXMLData(xmlFilePath: string): Promise<any> {
  try {
    const raw = await fs.readFileAsync(xmlFilePath);
    const data = await parseStringPromise(raw);
    return data;
  }
  catch(err) {
    throw err;
  }
}

import { Promise as Bluebird } from 'bluebird';
import path from 'path';
import semver from 'semver';
import { parseXmlString, Element } from 'libxmljs';
import walk from 'turbowalk';

import { actions, fs, selectors, util } from 'vortex-api';

import { GAME_ID, SUBMOD_FILE, I18N_NAMESPACE } from './common';

export function migrate045(api, oldVersion) {
  if (semver.gte(oldVersion, '0.4.5')) {
    return Bluebird.resolve();
  }

  return api.awaitUI()
    .then(() => {
      const state = api.getState();
      const activeGameId = selectors.activeGameId(state);
      if (activeGameId !== GAME_ID) {
        return Bluebird.resolve();
      }
      api.sendNotification({
        id: 'mnb2-045-migration',
        type: 'info',
        message: api.translate('Bannerlord - Important Information', { ns: I18N_NAMESPACE }),
        noDismiss: true,
        actions: [
          {
            title: 'More',
            action: (dismiss) => {
              dismiss();
              api.showDialog('info', 'Mount and Blade II: Bannerlord', {
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
      return Bluebird.resolve();
    })
}

export function migrate026(api, oldVersion) {
  if (semver.gte(oldVersion, '0.2.6')) {
    return Bluebird.resolve();
  }

  const state = api.getState();
  const mods = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  return Bluebird.each(Object.keys(mods), iter => addSubModsAttrib(api, mods[iter]));
}

function addSubModsAttrib(api, mod) {
  if (mod === undefined) {
    // Weird, but we don't care.
    return Bluebird.resolve();
  }
  const state = api.getState();
  const stagingFolder = selectors.installPathForGame(state, GAME_ID);
  const modPath = path.join(stagingFolder, mod.installationPath);
  let allEntries = [];
  return walk(modPath, entries => {
    allEntries = allEntries.concat(entries.filter(entry => path.basename(entry.filePath).toLowerCase() === SUBMOD_FILE));
  }, { skipInaccessible: true, recurse: true, skipLinks: true })
  .catch(err => Bluebird.resolve()) // We don't care for errors.
  .then(() => {
    return (allEntries.length > 1)
      ? Bluebird.reduce(allEntries, async (accum, entry) => {
        try {
          const data = await getXMLData(entry.filePath);
          const subModId = data.get<Element>('//Id').attr('value').value();
          accum.push(subModId);
        } catch (err) {
          // nop - we don't care for errors - this is supposed to be
          //  a noninvasive "migration".
        }
        return Bluebird.resolve(accum);
      }, [])
        .then(subModIds => {
          api.store.dispatch(actions.setModAttribute(GAME_ID, mod.id, 'subModIds', subModIds))
          return Bluebird.resolve();
        })
      : Bluebird.resolve();
    });
}

async function getXMLData(xmlFilePath) {
  return fs.readFileAsync(xmlFilePath)
    .then(data => {
      try {
        const xmlData = parseXmlString(data);
        return Bluebird.resolve(xmlData);
      } catch (err) {
        return Bluebird.reject(err);
      }
    })
}
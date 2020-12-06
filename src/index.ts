//import { ParseModule } from './module-xml-parser'
//import { TopologySort } from './module-topology-sorter'
import { findGame, prepareForModding, getValidationInfo, refreshCacheOnEvent } from './utils'
import { infoComponent } from './ui'
import { testRootMod, installRootMod, testForSubmodules, installSubModules } from './module-installer'
import ConstantStorage from './constants';

import Promise from 'bluebird';
import * as path from 'path';
import { fs, log, selectors, util } from "vortex-api";
import { IExtensionContext } from 'vortex-api/lib/types/api';


const constants = new ConstantStorage();
const { GAME_ID, BANNERLORD_EXEC, STEAMAPP_ID, EPICAPP_ID, MODULES } = constants;

//This is the main function Vortex will run when detecting the game extension. 
function main(context: IExtensionContext): boolean {
    context.registerGame({
        id: GAME_ID,
        name: 'Mount & Blade II: Bannerlord',
        mergeMods: true,
        queryPath: findGame,
        queryModPath: () => '.',
        logo: 'gameart.jpg',
        executable: () => constants.BANNERLORD_EXEC,
        setup: (discovery) => prepareForModding(context, discovery),
        requiredFiles: [
          BANNERLORD_EXEC
        ],
        parameters: [],
        requiresCleanup: true,
        environment: {
          SteamAPPId: STEAMAPP_ID.toString(),
        },
        details: {
          steamAppId: STEAMAPP_ID,
          epicAppId: EPICAPP_ID,
          customOpenModsPath: MODULES,
        },
      });
    
      let refreshFunc;
      // Register the LO page.
      context.registerLoadOrderPage({
        gameId: GAME_ID,
        createInfoPanel: (props) => {
          refreshFunc = props.refresh;
          return infoComponent(context, props);
        },
        gameArtURL: `${__dirname}/gameart.jpg`,
        //preSort: (items, direction) => preSort(context, items, direction),
        //callback: (loadOrder) => refreshGameParams(context, loadOrder),
        //itemRenderer: CustomItemRenderer.default,
      });
    
      // We currently have only one mod on NM and it is a root mod.
      context.registerInstaller('bannerlordrootmod', 20, testRootMod, installRootMod);
    
      // Installs one or more submodules.
      context.registerInstaller('bannerlordsubmodules', 25, testForSubmodules, installSubModules);
    
      /*
      context.registerAction('generic-load-order-icons', 200,
        _IS_SORTING ? 'spinner' : 'loot-sort', {}, 'Auto Sort', async () => {
          if (_IS_SORTING) {
            // Already sorting - don't do anything.
            return Promise.resolve();
          }
    
          _IS_SORTING = true;
    
          try {
            CACHE = {};
            const deployedSubModules = await getDeployedSubModPaths(context);
            CACHE = await getDeployedModData(context, deployedSubModules);
          } catch (err) {
            context.api.showErrorNotification('Failed to resolve submodule file data', err);
            _IS_SORTING = false;
            return;
          }
    
          const modIds = Object.keys(CACHE);
          const lockedIds = modIds.filter(id => CACHE[id].isLocked);
          const subModIds = modIds.filter(id => !CACHE[id].isLocked);
    
          let sortedLocked = [];
          let sortedSubMods = [];
    
          const state = context.api.store.getState();
          const activeProfile = selectors.activeProfile(state);
          if (activeProfile?.id === undefined) {
            // Probably best that we don't report this via notification as a number
            //  of things may have occurred that caused this issue. We log it instead.
            log('error', 'Failed to sort mods', { reason: 'No active profile' });
            _IS_SORTING = false;
            return;
          }
    
          const loadOrder = util.getSafe(state, ['persistent', 'loadOrder', activeProfile.id], {});
    
          try {
            sortedLocked = tSort(lockedIds, true);
            sortedSubMods = tSort(subModIds, false, loadOrder);
          } catch (err) {
            context.api.showErrorNotification('Failed to sort mods', err);
            return;
          }
    
          const newOrder = [].concat(sortedLocked, sortedSubMods).reduce((accum, id, idx) => {
            const vortexId = CACHE[id].vortexId;
            const newEntry = {
              pos: idx,
              enabled: CACHE[id].isOfficial
                ? true
                : (!!loadOrder[vortexId])
                  ? loadOrder[vortexId].enabled
                  : true,
              locked: (loadOrder[vortexId]?.locked === true),
            }
    
            accum[vortexId] = newEntry;
            return accum;
          }, {});
    
          context.api.store.dispatch(actions.setLoadOrder(activeProfile.id, newOrder));
          return refreshGameParams(context, newOrder)
            .then(() => context.api.sendNotification({
              id: 'mnb2-sort-finished',
              type: 'info',
              message: context.api.translate('Finished sorting', { ns: I18N_NAMESPACE }),
              displayMS: 3000,
            })).finally(() => _IS_SORTING = false);
      }, () => {
        const state = context.api.store.getState();
        const gameId = selectors.activeGameId(state);
        return (gameId === GAME_ID);
      });
      */
    
      context.once(() => {
        context.api.onAsync('did-deploy', async (profileId, deployment) =>
          refreshCacheOnEvent(context, refreshFunc, profileId));
    
        context.api.onAsync('did-purge', async (profileId) =>
          refreshCacheOnEvent(context, refreshFunc, profileId));
    
        context.api.events.on('profile-did-change', (profileId) =>
          refreshCacheOnEvent(context, refreshFunc, profileId));
    
        context.api.onAsync('added-files', async (profileId, files) => {
          const state = context.api.store.getState();
          const profile = selectors.profileById(state, profileId);
          if (profile.gameId !== GAME_ID) {
            // don't care about any other games
            return;
          }
          const game = util.getGame(GAME_ID);
          const discovery = selectors.discoveryByGame(state, GAME_ID);
          const modPaths = game.getModPaths(discovery.path);
          const installPath = selectors.installPathForGame(state, GAME_ID);
    
          await Promise.map(files, async entry => {
            // only act if we definitively know which mod owns the file
            if (entry.candidates.length === 1) {
              const mod = util.getSafe(state.persistent.mods, [GAME_ID, entry.candidates[0]], undefined);
              if (mod === undefined) {
                return Promise.resolve();
              }
              const relPath = path.relative(modPaths[mod.type ?? ''], entry.filePath);
              const targetPath = path.join(installPath, mod.id, relPath);
              // copy the new file back into the corresponding mod, then delete it. That way, vortex will
              // create a link to it with the correct deployment method and not ask the user any questions
              await fs.ensureDirAsync(path.dirname(targetPath));
    
              // Remove the target destination file if it exists.
              //  this is to completely avoid a scenario where we may attempt to
              //  copy the same file onto itself.
              return fs.removeAsync(targetPath)
                .catch(err => (err.code === 'ENOENT')
                  ? Promise.resolve()
                  : Promise.reject(err))
                .then(() => fs.copyAsync(entry.filePath, targetPath))
                .then(() => fs.removeAsync(entry.filePath))
                .catch(err => log('error', 'failed to import added file to mod', err.message));
            }
          });
        });
      })
    
      return true;
}

export default main;
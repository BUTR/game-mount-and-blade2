import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { actions, selectors, types, util } from 'vortex-api';
import { gte } from 'semver';
import { GAME_ID, BLSE_MOD_ID, BLSE_URL } from '../common';

export const findBLSEMod = (api: types.IExtensionApi): types.IMod | undefined => {
  const state = api.getState();
  const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
  const profile = selectors.profileById(state, profileId);
  const isActive = (modId: string) => util.getSafe(profile, ['modState', modId, 'enabled'], false);
  const isBLSE = (mod: types.IMod) => mod.type === 'BLSE' && mod.attributes?.modId === 1;
  const mods: { [modId: string]: types.IMod } = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
  const BLSEMods: types.IMod[] = Object.values(mods).filter((mod: types.IMod) => isBLSE(mod) && isActive(mod.id));

  return (BLSEMods.length === 0)
    ? undefined
    : BLSEMods.length > 1
      ? BLSEMods.reduce((prev: types.IMod | undefined, iter: types.IMod) => {
        if (prev === undefined) {
          return iter;
        }
        return (gte(iter.attributes?.version ?? '0.0.0', prev.attributes?.version ?? '0.0.0')) ? iter : prev;
      }, undefined)
      : BLSEMods[0];
}

const deployBLSE = async (api: types.IExtensionApi) => {
  await util.toPromise(cb => api.events.emit('deploy-mods', cb));
  await util.toPromise(cb => api.events.emit('start-quick-discovery', () => cb(null)));

  const discovery = selectors.discoveryByGame(api.getState(), GAME_ID);
  const tool = discovery?.tools?.['blse'];
  if (tool) {
    api.store?.dispatch(actions.setPrimaryTool(GAME_ID, tool.id));
  }
}

const downloadBLSE = async (api: types.IExtensionApi, update?: boolean) => {
  api.dismissNotification?.('blse-missing');
  api.sendNotification?.({
    id: 'blse-installing',
    message: update ? 'Updating BLSE' : 'Installing BLSE',
    type: 'activity',
    noDismiss: true,
    allowSuppress: false,
  });

  if (api.ext?.ensureLoggedIn !== undefined) {
    await api.ext.ensureLoggedIn();
  }

  try {
    const modFiles = await api.ext.nexusGetModFiles?.(GAME_ID, BLSE_MOD_ID) || [];

    const fileTime = (input: any) => Number.parseInt(input.uploaded_time, 10);

    const file = modFiles
      .filter(file => file.category_id === 1)
      .sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs))[0];

    if (file === undefined) {
      throw new util.ProcessCanceled('No BLSE main file found');
    }

    const dlInfo = {
      game: GAME_ID,
      name: 'BLSE',
    };

    const nxmUrl = `nxm://${GAME_ID}/mods/${BLSE_MOD_ID}/files/${file.file_id}`;
    const dlId = await util.toPromise<string>(cb =>
      api.events.emit('start-download', [nxmUrl], dlInfo, undefined, cb, undefined, { allowInstall: false }));
    const modId = await util.toPromise<string>(cb =>
      api.events.emit('start-install-download', dlId, { allowAutoEnable: false }, cb));
    const profileId = selectors.lastActiveProfileForGame(api.getState(), GAME_ID);
    await actions.setModsEnabled(api, profileId, [modId], true, {
      allowAutoDeploy: false,
      installed: true,
    });

    await deployBLSE(api);
  } catch (err) {
    api.showErrorNotification?.('Failed to download/install BLSE', err);
    util.opn(BLSE_URL).catch(() => null);
  } finally {
    api.dismissNotification?.('blse-installing');
  }
}

export const recommendBLSE = (context: types.IExtensionContext) => {
  const blseMod = findBLSEMod(context.api);
  const title = blseMod ? 'BLSE is not deployed' : 'BLSE is not installed';
  const actionTitle = blseMod ? 'Deploy' : 'Get BLSE';
  const action = () => (blseMod
    ? deployBLSE(context.api)
    : downloadBLSE(context.api))
    .then(() => context.api.dismissNotification?.('blse-missing'));

  context.api.sendNotification?.({
    id: 'blse-missing',
    type: 'warning',
    title,
    message: 'BLSE is recommended to mod Bannerlord.',
    actions: [
      {
        title: actionTitle,
        action,
      },
    ]
  });
};
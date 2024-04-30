// eslint-disable-next-line no-restricted-imports
import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types } from 'vortex-api';
import { EPICAPP_ID, GAME_ID, GOG_IDS, MODULES, STEAMAPP_ID, XBOX_ID } from './common';
import { VortexLauncherManager, findGame, getBannerlordMainExe, requiresLauncher, setup } from './utils';

export class BannerlordGame implements types.IGame {
  private _api: types.IExtensionApi;
  private _launcherManager: VortexLauncherManager;

  public id: string = GAME_ID;
  public name = `Mount & Blade II: Bannerlord (BUTR)`;
  public logo = `gameart.jpg`;
  public mergeMods = true;
  public queryArgs: { [storeId: string]: types.IStoreQuery[] } = {
    steam: [{ id: STEAMAPP_ID.toString() }],
    xbox: [{ id: XBOX_ID }],
    gog: GOG_IDS.map((x) => ({ id: x })),
    epic: [{ id: EPICAPP_ID }],
  };
  public requiredFiles: string[] = [];
  public parameters: string[] = [];
  public requiresCleanup = true;
  public details: { [key: string]: unknown } = {
    nexusPageId: GAME_ID,
    steamAppId: STEAMAPP_ID,
    epicAppId: EPICAPP_ID,
    xboxId: XBOX_ID,
    customOpenModsPath: MODULES,
  };

  constructor(api: types.IExtensionApi, launcherManager: VortexLauncherManager) {
    this._api = api;
    this._launcherManager = launcherManager;
  }

  public queryPath = (): Bluebird<string | types.IGameStoreEntry> => {
    return toBluebird(findGame)({}).then((game) => game.gamePath);
  };
  public queryModPath = (_gamePath: string): string => {
    return `.`;
  };
  public getGameVersion = (_gamePath: string, _exePath: string): PromiseLike<string> => {
    return this._launcherManager.getGameVersionVortexAsync();
  };
  public executable = (discoveredPath?: string): string => {
    return getBannerlordMainExe(discoveredPath, this._api);
  };
  public setup = toBluebird((discovery: types.IDiscoveryResult): Bluebird<void> => {
    return toBluebird(setup)(this._api, discovery, this._launcherManager);
  });
  //public requiresLauncher = toBluebird((_gamePath: string, store?: string) => {
  //  return requiresLauncher(store);
  //});
}

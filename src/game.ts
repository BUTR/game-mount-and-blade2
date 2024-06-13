// eslint-disable-next-line no-restricted-imports
import Bluebird, { Promise, method as toBluebird } from 'bluebird';
import { types } from 'vortex-api';
import { EPICAPP_ID, GAME_ID, GOG_IDS, MODULES, STEAMAPP_ID, XBOX_ID } from './common';
import { findGame, getBannerlordMainExe, setup, VortexLauncherManager } from './utils';

export class BannerlordGame implements types.IGame {
  private api: types.IExtensionApi;

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
  public requiredFiles: string[] = ['bin', 'Modules'];
  public parameters: string[] = [];
  public requiresCleanup = true;
  public details: { [key: string]: unknown } = {
    nexusPageId: GAME_ID,
    steamAppId: STEAMAPP_ID,
    epicAppId: EPICAPP_ID,
    xboxId: XBOX_ID,
    customOpenModsPath: MODULES,
  };

  constructor(api: types.IExtensionApi) {
    this.api = api;
  }

  public queryPath = toBluebird<string | types.IGameStoreEntry>(async (): Promise<string | types.IGameStoreEntry> => {
    const game = await findGame();
    return game.gamePath;
  });
  public queryModPath = (_gamePath: string): string => {
    return `.`;
  };
  public getGameVersion = (_gamePath: string, _exePath: string): PromiseLike<string> => {
    return VortexLauncherManager.getInstance(this.api).getGameVersionVortexAsync();
  };
  public executable = (discoveredPath?: string): string => {
    return getBannerlordMainExe(discoveredPath, this.api);
  };
  public setup = toBluebird(async (discovery: types.IDiscoveryResult) => {
    await setup(this.api, discovery);
  });
  //public requiresLauncher = toBluebird(async (_gamePath: string, store?: string) => {
  //  return await requiresLauncher(store);
  //});
}

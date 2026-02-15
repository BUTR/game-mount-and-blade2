import { method as toBluebird } from "bluebird";
import { selectors, types } from "vortex-api";
import path from "path";
import { statSync } from "node:fs";
import { FetchBannerlordVersion } from "@butr/vortexextensionnative";
import { isStoreStandard, isStoreXbox } from "./store";
import { findGameAsync, setupAsync } from "./utils";
import {
  BANNERLORD_EXE,
  BANNERLORD_EXE_XBOX,
  BINARY_FOLDER_STANDARD,
  BINARY_FOLDER_STANDARD_MODDING_KIT,
  BINARY_FOLDER_XBOX,
  EPICAPP_ID,
  GAME_ID,
  GOG_IDS,
  MODULES,
  STEAMAPP_ID,
  XBOX_ID,
} from "../common";

export const getBinaryPath = (store: string | undefined): string => {
  return path.join(
    `bin`,
    isStoreXbox(store) ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD,
  );
};

export const getBinaryModdingPath = (_store: string | undefined): string => {
  return path.join(`bin`, BINARY_FOLDER_STANDARD_MODDING_KIT);
};

export const getBannerlordMainExe = (
  discoveryPath: string | undefined,
  api: types.IExtensionApi,
): string => {
  const standard = (): string =>
    path.join(`bin`, BINARY_FOLDER_STANDARD, BANNERLORD_EXE);
  const xbox = (): string =>
    path.join(`bin`, BINARY_FOLDER_XBOX, BANNERLORD_EXE_XBOX);

  const state = api.getState();
  const discovery = selectors.discoveryByGame(state, GAME_ID);
  if (!discovery) {
    return ``;
  }

  if (isStoreXbox(discovery.store)) {
    return xbox();
  }

  if (isStoreStandard(discovery.store)) {
    return standard();
  }

  if (discovery.store === undefined && discoveryPath !== undefined) {
    // Brute force the detection by manually checking the paths.
    try {
      statSync(path.join(discoveryPath, BANNERLORD_EXE_XBOX));
      return xbox();
    } catch {
      return standard();
    }
  }

  return standard();
};

export const getBannerlordToolExe = (
  discoveryPath: string | undefined,
  api: types.IExtensionApi,
  exe: string,
): string => {
  const standard = (): string => path.join(`bin`, BINARY_FOLDER_STANDARD, exe);
  const xbox = (): string => path.join(`bin`, BINARY_FOLDER_XBOX, exe);

  const state = api.getState();
  const discovery = selectors.discoveryByGame(state, GAME_ID);
  if (!discovery) {
    return ``;
  }

  if (isStoreXbox(discovery.store)) {
    return xbox();
  }

  if (isStoreStandard(discovery.store)) {
    return standard();
  }

  if (discovery.store === undefined && discoveryPath !== undefined) {
    // Brute force the detection by manually checking the paths.
    try {
      statSync(path.join(discoveryPath, BANNERLORD_EXE_XBOX));
      return xbox();
    } catch {
      return standard();
    }
  }

  return standard();
};

export class BannerlordGame implements types.IGame {
  private api: types.IExtensionApi;

  public id: string = GAME_ID;
  public name = `Mount & Blade II: Bannerlord (BUTR)`;
  public shortName = `M&B II: Bannerlord`;
  public logo = `gameart.jpg`;
  public mergeMods = true;
  public queryArgs: { [storeId: string]: types.IStoreQuery[] } = {
    steam: [{ id: STEAMAPP_ID.toString() }],
    xbox: [{ id: XBOX_ID }],
    gog: GOG_IDS.map((x) => ({ id: x })),
    epic: [{ id: EPICAPP_ID }],
  };
  public requiredFiles: string[] = ["bin", "Modules"];
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

  public queryPath = toBluebird<string | types.IGameStoreEntry>(
    async (): Promise<string | types.IGameStoreEntry> => {
      const game = await findGameAsync();
      return game.gamePath;
    },
  );
  public queryModPath = (_gamePath: string): string => {
    return `.`;
  };
  public getGameVersion = (
    gamePath: string,
    _exePath: string,
  ): PromiseLike<string> => {
    const version = FetchBannerlordVersion.getVersion(
      gamePath,
      "TaleWorlds.Library.dll",
    );
    return Promise.resolve(version);
  };
  public executable = (discoveredPath?: string): string => {
    return getBannerlordMainExe(discoveredPath, this.api);
  };
  public setup = toBluebird(async (discovery: types.IDiscoveryResult) => {
    await setupAsync(this.api, discovery);
  });
  //public requiresLauncher = toBluebird(async (_gamePath: string, store?: string) => {
  //  return await requiresLauncher(store);
  //});
}

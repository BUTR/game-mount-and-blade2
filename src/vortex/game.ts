import { fs, selectors, types } from 'vortex-api';
import path from 'path';
import { isStoreStandard, isStoreXbox } from './store';
import {
  BANNERLORD_EXE,
  BANNERLORD_EXE_XBOX,
  BINARY_FOLDER_STANDARD,
  BINARY_FOLDER_STANDARD_MODDING_KIT,
  BINARY_FOLDER_XBOX,
  GAME_ID,
} from '../common';

export const getBinaryPath = (store: string | undefined): string => {
  return path.join(`bin`, isStoreXbox(store) ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD);
};

export const getBinaryModdingPath = (_store: string | undefined): string => {
  return path.join(`bin`, BINARY_FOLDER_STANDARD_MODDING_KIT);
};

export const getBannerlordMainExe = (discoveryPath: string | undefined, api: types.IExtensionApi): string => {
  const standard = (): string => path.join(`bin`, BINARY_FOLDER_STANDARD, BANNERLORD_EXE);
  const xbox = (): string => path.join(`bin`, BINARY_FOLDER_XBOX, BANNERLORD_EXE_XBOX);

  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(api.getState(), GAME_ID);
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
      fs.statSync(path.join(discoveryPath, BANNERLORD_EXE_XBOX));
      return xbox();
    } catch (err) {
      return standard();
    }
  }

  return standard();
};

export const getBannerlordToolExe = (
  discoveryPath: string | undefined,
  api: types.IExtensionApi,
  exe: string
): string => {
  const standard = (): string => path.join(`bin`, BINARY_FOLDER_STANDARD, exe);
  const xbox = (): string => path.join(`bin`, BINARY_FOLDER_XBOX, exe);

  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(api.getState(), GAME_ID);
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
      fs.statSync(path.join(discoveryPath, BANNERLORD_EXE_XBOX));
      return xbox();
    } catch (err) {
      return standard();
    }
  }

  return standard();
};

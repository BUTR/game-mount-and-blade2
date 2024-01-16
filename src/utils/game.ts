import path from 'path';
import { fs, selectors, types } from 'vortex-api';
import { isStoreStandard, isStoreXbox } from '.';
import {
  BANNERLORD_EXE,
  BANNERLORD_EXE_XBOX,
  BINARY_FOLDER_STANDARD,
  BINARY_FOLDER_XBOX,
  BINARY_FOLDER_STANDARD_MODDING_KIT,
} from '../common';

export const getBinaryPath = (store: string | undefined): string => {
  return path.join(`bin`, isStoreXbox(store) ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD);
};

export const getBinaryModdingPath = (_store: string | undefined): string => {
  return path.join(`bin`, BINARY_FOLDER_STANDARD_MODDING_KIT);
};

export const getBannerlordMainExe = (discoveryPath: string | undefined, api: types.IExtensionApi): string => {
  const standard = () => path.join(`bin`, BINARY_FOLDER_STANDARD, BANNERLORD_EXE);
  const xbox = () => path.join(`bin`, BINARY_FOLDER_XBOX, BANNERLORD_EXE_XBOX);

  const discovery = selectors.currentGameDiscovery(api.getState());
  if (!discovery) {
    return ``;
  }

  if (isStoreXbox(discovery.store)) {
    return xbox();
  }

  if (isStoreStandard(discovery.store)) {
    return standard();
  }

  if (!discovery.store && discoveryPath) {
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
  const standard = () => path.join(`bin`, BINARY_FOLDER_STANDARD, exe);
  const xbox = () => path.join(`bin`, BINARY_FOLDER_XBOX, exe);

  const discovery = selectors.currentGameDiscovery(api.getState());
  if (!discovery) {
    return ``;
  }

  if (isStoreXbox(discovery.store)) {
    return xbox();
  }

  if (isStoreStandard(discovery.store)) {
    return standard();
  }

  if (!discovery.store && discoveryPath) {
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

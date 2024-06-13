// TODO: Translate tool titles?
import { actions, types } from 'vortex-api';
import path from 'path';
import { getBinaryModdingPath, getBinaryPath } from './game';
import { isStoreSteam } from './store';
import {
  BANNERLORD_EXE,
  BANNERLORD_EXE_LAUNCHER,
  BLSE_CLI_EXE,
  BLSE_LAUNCHER_EXE,
  BLSE_LAUNCHEREX_EXE,
  GAME_ID,
} from '../common';

// TODO: Reuse tool creation code

const addDiscoveredTool = (api: types.IExtensionApi, tool: types.IDiscoveredTool) => {
  return api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, tool.id, tool, false));
};

export const addBLSETools = async (api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  const tools = [
    { id: 'blse-cli', name: `Bannerlord Software Extender`, exe: BLSE_CLI_EXE },
    {
      id: 'blse-launcher',
      name: `Bannerlord Software Extender Official Launcher`,
      exe: BLSE_LAUNCHER_EXE,
    },
    {
      id: 'blse-launcherex',
      name: `Bannerlord Software Extender LauncherEx`,
      exe: BLSE_LAUNCHEREX_EXE,
    },
  ];
  for (const x of tools) {
    const { id, name, exe } = x;
    const tool: types.IDiscoveredTool = {
      id: id,
      name: name,
      logo: `blse.png`,
      path: path.join(discovery.path, getBinaryPath(discovery.store), exe),
      requiredFiles: [exe],
      hidden: false,
      custom: true,
      defaultPrimary: id === `blse-cli`,
      executable: () => '',
    };
    addDiscoveredTool(api, tool);
  }
};

export const addOfficialCLITool = (api: types.IExtensionApi, discovery: types.IDiscoveryResult): void => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  const pathBase = getBinaryPath(discovery.store);
  const pathExe = path.join(pathBase, BANNERLORD_EXE);

  const tool: types.IDiscoveredTool = {
    id: `vanilla-cli`,
    name: `Official Bannerlord`,
    logo: `tw_launcher.png`,
    path: path.join(discovery.path, pathExe),
    requiredFiles: [BANNERLORD_EXE],
    hidden: false,
    custom: false,
    executable: () => '',
  };
  addDiscoveredTool(api, tool);
};

export const addOfficialLauncherTool = (api: types.IExtensionApi, discovery: types.IDiscoveryResult): void => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  const tool: types.IDiscoveredTool = {
    id: `vanilla-launcher`,
    name: `Official Bannerlord Launcher`,
    logo: `tw_launcher.png`,
    requiredFiles: [BANNERLORD_EXE_LAUNCHER],
    path: path.join(discovery.path, getBinaryPath(discovery.store), BANNERLORD_EXE_LAUNCHER),
    hidden: false,
    custom: false,
    executable: () => '',
  };
  addDiscoveredTool(api, tool);
};

export const addModdingKitTool = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  hidden?: boolean
): void => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  if (!isStoreSteam(discovery.store)) {
    return;
  }

  const tool: types.IDiscoveredTool = {
    id: `bannerlord-sdk`,
    name: `Modding Kit`,
    logo: `tw_launcher.png`,
    path: path.join(discovery.path, getBinaryModdingPath(discovery.store), BANNERLORD_EXE_LAUNCHER),
    requiredFiles: [BANNERLORD_EXE_LAUNCHER],
    exclusive: true,
    hidden: hidden ?? false,
    custom: false,
    executable: () => '',
  };
  addDiscoveredTool(api, tool);
};

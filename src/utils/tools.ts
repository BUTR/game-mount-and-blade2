import path from 'path';
import { actions, types } from 'vortex-api';
import { getBinaryModdingPath, getBinaryPath, isStoreSteam } from '.';
import {
  GAME_ID,
  BLSE_CLI_EXE,
  BLSE_LAUNCHER_EXE,
  BLSE_LAUNCHEREX_EXE,
  BANNERLORD_EXE,
  BANNERLORD_EXE_LAUNCHER,
} from '../common';

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
    const pathBase = getBinaryPath(discovery.store);
    const pathExe = path.join(pathBase, exe);
    const tool: types.IDiscoveredTool = {
      id: id,
      name: name,
      logo: `blse.png`,
      executable: () => pathExe,
      requiredFiles: [pathExe],
      path: path.join(discovery.path, pathExe),
      relative: true,
      workingDirectory: path.join(discovery.path, pathBase),
      hidden: false,
      custom: true,
      defaultPrimary: id === `blse-cli`,
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
    executable: () => pathExe,
    requiredFiles: [pathExe],
    path: path.join(discovery.path, pathExe),
    relative: true,
    workingDirectory: path.join(discovery.path, pathBase),
    hidden: false,
    custom: false,
  };
  addDiscoveredTool(api, tool);
};

export const addOfficialLauncherTool = (api: types.IExtensionApi, discovery: types.IDiscoveryResult): void => {
  if (!discovery.path) {
    throw new Error(`discovery.path is undefined!`);
  }

  const pathBase = getBinaryPath(discovery.store);
  const pathExe = path.join(pathBase, BANNERLORD_EXE_LAUNCHER);

  const tool: types.IDiscoveredTool = {
    id: `vanilla-launcher`,
    name: `Official Bannerlord Launcher`,
    logo: `tw_launcher.png`,
    executable: () => pathExe,
    requiredFiles: [pathExe],
    path: path.join(discovery.path, pathExe),
    relative: true,
    workingDirectory: path.join(discovery.path, pathBase),
    hidden: false,
    custom: false,
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

  const pathBase = getBinaryModdingPath(discovery.store);
  const pathExe = path.join(pathBase, BANNERLORD_EXE_LAUNCHER);

  const tool: types.IDiscoveredTool = {
    id: `bannerlord-sdk`,
    name: `Modding Kit`,
    logo: `tw_launcher.png`,
    executable: () => pathExe,
    requiredFiles: [pathExe],
    path: path.join(discovery.path, pathExe),
    relative: true,
    exclusive: true,
    workingDirectory: path.join(discovery.path, pathBase),
    hidden: hidden ?? false,
    custom: false,
  };
  addDiscoveredTool(api, tool);
};

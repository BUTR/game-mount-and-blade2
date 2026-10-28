// TODO: Translate tool titles?
import { actions, types } from "@nexusmods/vortex-api";
import path from "path";
import { getBinaryModdingPath, getBinaryPath, isStoreSteam } from "./store";
import {
  BANNERLORD_EXE,
  BANNERLORD_EXE_LAUNCHER,
  BLSE_CLI_EXE,
  BLSE_LAUNCHER_EXE,
  BLSE_LAUNCHEREX_EXE,
  GAME_ID,
} from "../common";

interface ToolConfig {
  id: string;
  name: string;
  logo: string;
  exe: string;
  binaryPath: string;
  requiredFiles?: string[];
  custom?: boolean;
  exclusive?: boolean;
  hidden?: boolean;
  defaultPrimary?: boolean;
}

const registerTool = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  config: ToolConfig,
): void => {
  if (discovery.path === undefined) {
    throw new Error(`discovery.path is undefined!`);
  }

  const tool: types.IDiscoveredTool = {
    id: config.id,
    name: config.name,
    logo: config.logo,
    path: path.join(discovery.path, config.binaryPath, config.exe),
    requiredFiles: config.requiredFiles ?? [config.exe],
    hidden: config.hidden ?? false,
    custom: config.custom ?? false,
    ...(config.defaultPrimary !== undefined && {
      defaultPrimary: config.defaultPrimary,
    }),
    ...(config.exclusive !== undefined && { exclusive: config.exclusive }),
    executable: () => "",
  };
  api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, tool.id, tool, false));
};

export const addBLSETools = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): void => {
  const binaryPath = getBinaryPath(discovery.store);
  const tools = [
    {
      id: "blse-cli",
      name: `Bannerlord Software Extender`,
      exe: BLSE_CLI_EXE,
      defaultPrimary: true,
    },
    {
      id: "blse-launcher",
      name: `Bannerlord Software Extender Official Launcher`,
      exe: BLSE_LAUNCHER_EXE,
    },
    {
      id: "blse-launcherex",
      name: `Bannerlord Software Extender LauncherEx`,
      exe: BLSE_LAUNCHEREX_EXE,
    },
  ];
  for (const t of tools) {
    // Not custom: Vortex deletes custom tools instead of hiding them, and the multiplayer mode hides these
    registerTool(api, discovery, {
      ...t,
      logo: `blse.png`,
      binaryPath,
    });
  }
};

export const addOfficialCLITool = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): void => {
  registerTool(api, discovery, {
    id: `vanilla-cli`,
    name: `Official Bannerlord`,
    logo: `tw_launcher.png`,
    exe: BANNERLORD_EXE,
    binaryPath: getBinaryPath(discovery.store),
  });
};

/**
 * The game executable again, as the multiplayer mode's tool. It gets the multiplayer launch arguments
 */
export const addOfficialMultiplayerCLITool = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): void => {
  registerTool(api, discovery, {
    id: `vanilla-mp-cli`,
    name: `Official Bannerlord Multiplayer`,
    logo: `tw_launcher.png`,
    exe: BANNERLORD_EXE,
    binaryPath: getBinaryPath(discovery.store),
  });
};

export const addOfficialLauncherTool = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
): void => {
  registerTool(api, discovery, {
    id: `vanilla-launcher`,
    name: `Official Bannerlord Launcher`,
    logo: `tw_launcher.png`,
    exe: BANNERLORD_EXE_LAUNCHER,
    binaryPath: getBinaryPath(discovery.store),
  });
};

export const addModdingKitTool = (
  api: types.IExtensionApi,
  discovery: types.IDiscoveryResult,
  hidden: boolean = false,
): void => {
  if (!isStoreSteam(discovery.store)) {
    // Steam's only. Vortex can't remove a tool, one added for a Steam folder before a store change is hidden
    if (discovery.tools?.["bannerlord-sdk"] !== undefined) {
      api.store?.dispatch(
        actions.setToolVisible(GAME_ID, "bannerlord-sdk", false),
      );
    }
    return;
  }

  registerTool(api, discovery, {
    id: `bannerlord-sdk`,
    name: `Modding Kit`,
    logo: `tw_launcher.png`,
    exe: BANNERLORD_EXE_LAUNCHER,
    binaryPath: getBinaryModdingPath(discovery.store),
    exclusive: true,
    hidden,
  });
};

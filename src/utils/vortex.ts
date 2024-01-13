import { Promise, method as toBluebird } from 'bluebird';
import path from 'path';
import { actions, fs, types, util } from 'vortex-api';
import { VortexLauncherManager, prepareForModding } from '.';
import { GAME_ID, LAUNCHER_EXEC, MODDING_KIT_EXEC } from '../common';

const addOfficialLauncher = (context: types.IExtensionContext, discovery: types.IDiscoveryResult): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const launcherId = `TaleWorldsBannerlordLauncher`;
  const exec = path.basename(LAUNCHER_EXEC);
  const tool: types.IDiscoveredTool = {
    id: launcherId,
    name: `Official Launcher`,
    logo: `tw_launcher.png`,
    executable: () => exec,
    requiredFiles: [exec],
    path: path.join(discovery.path, LAUNCHER_EXEC),
    relative: true,
    workingDirectory: path.join(discovery.path, `bin`, `Win64_Shipping_Client`),
    hidden: false,
    custom: false,
  };
  context.api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, launcherId, tool, false));
};

const addModdingKit = (context: types.IExtensionContext, discovery: types.IDiscoveryResult, hidden?: boolean): void => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  const toolId = `bannerlord-sdk`;
  const exec = path.basename(MODDING_KIT_EXEC);
  const tool: types.IDiscoveredTool = {
    id: toolId,
    name: `Modding Kit`,
    logo: `tw_launcher.png`,
    executable: () => exec,
    requiredFiles: [exec],
    path: path.join(discovery.path, MODDING_KIT_EXEC),
    relative: true,
    exclusive: true,
    workingDirectory: path.join(discovery.path, path.dirname(MODDING_KIT_EXEC)),
    hidden: hidden || false,
    custom: false,
  };
  context.api.store?.dispatch(actions.addDiscoveredTool(GAME_ID, toolId, tool, false));
};

export const setup = async (context: types.IExtensionContext, discovery: types.IDiscoveryResult, manager: VortexLauncherManager): Promise<void> => {
  if (!discovery.path) throw new Error(`discovery.path is undefined!`);

  // Quickly ensure that the official Launcher is added.
  addOfficialLauncher(context, discovery);
  try {
    await fs.statAsync(path.join(discovery.path, MODDING_KIT_EXEC));
    addModdingKit(context, discovery);
  } catch (err) {
    const tools = discovery?.tools;
    if (tools !== undefined && util.getSafe(tools, [`bannerlord-sdk`], undefined) !== undefined) {
      addModdingKit(context, discovery, true);
    }
  }

  await prepareForModding(context, discovery, manager);
};

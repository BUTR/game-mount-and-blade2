import * as path from 'path';
//import { app, remote } from 'electron';

//interface App { getPath: (arg0: string) => string; }
//const app: App = require('electron');
//const remote: { app: App; } = require('electron');
const { app, remote } = require('electron');


export const APPUNI = app || remote.app;
export const LAUNCHER_EXEC = path.join('bin', 'Win64_Shipping_Client', 'TaleWorlds.MountAndBlade.Launcher.exe');
export const MODDING_KIT_EXEC = path.join('bin', 'Win64_Shipping_wEditor', 'TaleWorlds.MountAndBlade.Launcher.exe');
export const LAUNCHER_DATA_PATH = path.join(APPUNI.getPath('documents'), 'Mount and Blade II Bannerlord', 'Configs', 'LauncherData.xml');

// Nexus Mods id for the game.
export const GAME_ID = 'mountandblade2bannerlord';
export const STEAMAPP_ID = 261550;
export const EPICAPP_ID = 'Chickadee';
export const MODULES = 'Modules';

export const I18N_NAMESPACE = 'game-mount-and-blade2';

export const XML_EL_MULTIPLAYER = 'MultiplayerModule';

// A set of folder names (lowercased) which are available alongside the
//  game's modules folder. We could've used the fomod installer stop patterns
//  functionality for this, but it's better if this extension is self contained;
//  especially given that the game's modding pattern changes quite often.
export const ROOT_FOLDERS = new Set(['bin', 'data', 'gui', 'icons', 'modules', 'music', 'shaders', 'sounds', 'xmlschemas']);

export const OFFICIAL_MODULES = new Set(['Native', 'CustomBattle', 'SandBoxCore', 'Sandbox', 'StoryMode']);

// Used for the "custom launcher" tools.
//  gameMode: singleplayer or multiplayer
//  subModIds: the mod ids we want to load into the game.
export const PARAMS_TEMPLATE = ['/{{gameMode}}', '_MODULES_{{subModIds}}*_MODULES_'];

// The relative path to the actual game executable, not the launcher.
export const BANNERLORD_EXEC = path.join('bin', 'Win64_Shipping_Client', 'Bannerlord.exe');

// Bannerlord mods have this file in their root.
//  Casing is actually "SubModule.xml"
export const SUBMOD_FILE = "submodule.xml";

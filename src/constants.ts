import * as path from 'path';
//import { app, remote } from 'electron';

//interface App { getPath: (arg0: string) => string; }
//const app: App = require('electron');
//const remote: { app: App; } = require('electron');
const { app, remote } = require('electron');

export default class ConstantStorage {
    APPUNI = app || remote.app;
    LAUNCHER_EXEC = path.join('bin', 'Win64_Shipping_Client', 'TaleWorlds.MountAndBlade.Launcher.exe');
    MODDING_KIT_EXEC = path.join('bin', 'Win64_Shipping_wEditor', 'TaleWorlds.MountAndBlade.Launcher.exe');
    LAUNCHER_DATA_PATH = path.join(this.APPUNI.getPath('documents'), 'Mount and Blade II Bannerlord', 'Configs', 'LauncherData.xml');
    
    // Nexus Mods id for the game.
    GAME_ID = 'mountandblade2bannerlord';
    STEAMAPP_ID = 261550;
    EPICAPP_ID = 'Chickadee';
    MODULES = 'Modules';
    
    I18N_NAMESPACE = 'game-mount-and-blade2';
    
    XML_EL_MULTIPLAYER = 'MultiplayerModule';
    
    // A set of folder names (lowercased) which are available alongside the
    //  game's modules folder. We could've used the fomod installer stop patterns
    //  functionality for this, but it's better if this extension is self contained;
    //  especially given that the game's modding pattern changes quite often.
    ROOT_FOLDERS = new Set(['bin', 'data', 'gui', 'icons', 'modules', 'music', 'shaders', 'sounds', 'xmlschemas']);
    
    OFFICIAL_MODULES = new Set(['Native', 'CustomBattle', 'SandBoxCore', 'Sandbox', 'StoryMode']);
    
    // Used for the "custom launcher" tools.
    //  gameMode: singleplayer or multiplayer
    //  subModIds: the mod ids we want to load into the game.
    PARAMS_TEMPLATE = ['/{{gameMode}}', '_MODULES_{{subModIds}}*_MODULES_'];
    
    // The relative path to the actual game executable, not the launcher.
    BANNERLORD_EXEC = path.join('bin', 'Win64_Shipping_Client', 'Bannerlord.exe');
    
    // Bannerlord mods have this file in their root.
    //  Casing is actually "SubModule.xml"
    SUBMOD_FILE = "submodule.xml";
}

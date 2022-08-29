//@ts-ignore
import Bluebird, { Promise } from 'bluebird';
import { method as toBluebird } from 'bluebird';

import path from 'path';

export const GAME_ID = 'mountandblade2bannerlord';

// Bannerlord mods have this file in their root.
//  Casing is actually "SubModule.xml"
export const SUBMOD_FILE = 'submodule.xml';

// The relative path to the actual game executable, not the launcher.
export const BANNERLORD_EXEC = path.join('bin', 'Win64_Shipping_Client', 'Bannerlord.exe');

export const MODULES = 'Modules';

export const OFFICIAL_MODULES = new Set(['Native', 'CustomBattle', 'SandBoxCore', 'Sandbox', 'StoryMode']);
export const LOCKED_MODULES = new Set([]);

export const I18N_NAMESPACE = 'game-mount-and-blade2';

// A set of folder names (lowercased) which are available alongside the
//  game's modules folder. We could've used the fomod installer stop patterns
//  functionality for this, but it's better if this extension is self contained;
//  especially given that the game's modding pattern changes quite often.
export const ROOT_FOLDERS = new Set(['bin', 'data', 'gui', 'icons', 'modules',
  'music', 'shaders', 'sounds', 'xmlschemas']);

import path from 'path';

export const TW_LOGO = path.join(__dirname, `TW_Logo.png`);
export const MODULE_LOGO = path.join(__dirname, `Module.png`);

export const GAME_ID = `mountandblade2bannerlord`;
export const I18N_NAMESPACE = `game-mount-and-blade2`;

// The relative path to the actual game executable, not the launcher.
export const BANNERLORD_EXEC = path.join(`bin`, `Win64_Shipping_Client`, `Bannerlord.exe`);
export const BANNERLORD_EXEC_XBOX = path.join(`bin`, `Gaming.Desktop.x64_Shipping_Client`, `Launcher.Native.exe`);

export const BLSE_EXE = `Bannerlord.BLSE.Standalone.exe`;
export const BLSE_MOD_ID = 1;
export const BLSE_URL = `https://www.nexusmods.com/${GAME_ID}/mods/${BLSE_MOD_ID}`;

export const MODULES = `Modules`;

export const OFFICIAL_MODULES = new Set([
  `Native`,
  `CustomBattle`,
  `SandBoxCore`,
  `Sandbox`,
  `StoryMode`,
  `BirthAndDeath`,
]);

export const LAUNCHER_EXEC = path.join(`bin`, `Win64_Shipping_Client`, `TaleWorlds.MountAndBlade.Launcher.exe`);
export const MODDING_KIT_EXEC = path.join(`bin`, `Win64_Shipping_wEditor`, `TaleWorlds.MountAndBlade.Launcher.exe`);

export const EXTENSION_BASE_ID = `MAB2B`;
export const GOG_IDS = [`1802539526`, `1564781494`];
export const STEAMAPP_ID = 261550;
export const EPICAPP_ID = `Chickadee`;
export const XBOX_ID = `TaleWorldsEntertainment.MountBladeIIBannerlord`;

// A set of folder names (lowercased) which are available alongside the
//  game's modules folder. We could've used the fomod installer stop patterns
//  functionality for this, but it's better if this extension is self contained;
//  especially given that the game's modding pattern changes quite often.
export const ROOT_FOLDERS = new Set([
  `bin`,
  `data`,
  `gui`,
  `icons`,
  `modules`,
  `music`,
  `shaders`,
  `sounds`,
  `xmlschemas`,
]);

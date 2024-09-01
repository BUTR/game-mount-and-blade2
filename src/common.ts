import path from 'path';

export const LOAD_ORDER_SUFFIX = `_loadorder.json`;

export const TW_LOGO = path.join(__dirname, `tw_logo.png`);
export const MODULE_LOGO = path.join(__dirname, `community_mod.png`);
export const STEAM_LOGO = path.join(__dirname, `steam.svg`);

export const GAME_ID = `mountandblade2bannerlord`;
export const I18N_NAMESPACE = `game-mount-and-blade2`;

export const SUBMODULE_FILE = `SubModule.xml`;

export const SUB_MODS_IDS = `subModsIds`;

export const BINARY_FOLDER_STANDARD = `Win64_Shipping_Client`;
export const BINARY_FOLDER_STANDARD_MODDING_KIT = `Win64_Shipping_wEditor`;
export const BINARY_FOLDER_XBOX = `Gaming.Desktop.x64_Shipping_Client`;

export const BANNERLORD_EXE = `Bannerlord.exe`;
export const BANNERLORD_EXE_XBOX = `Launcher.Native.exe`;
export const BANNERLORD_EXE_LAUNCHER = `TaleWorlds.MountAndBlade.Launcher.exe`;

export const BLSE_CLI_EXE = `Bannerlord.BLSE.Standalone.exe`;
export const BLSE_LAUNCHER_EXE = `Bannerlord.BLSE.Launcher.exe`;
export const BLSE_LAUNCHEREX_EXE = `Bannerlord.BLSE.LauncherEx.exe`;
export const BLSE_MOD_ID = 1;
export const BLSE_URL = `https://www.nexusmods.com/${GAME_ID}/mods/${BLSE_MOD_ID}`;
export const HARMONY_MOD_ID = 2006;
export const HARMONY_URL = `https://www.nexusmods.com/${GAME_ID}/mods/${HARMONY_MOD_ID}`;

export const MODULES = `Modules`;

export const OFFICIAL_MODULES = new Set([
  `Native`,
  `CustomBattle`,
  `SandBoxCore`,
  `Sandbox`,
  `StoryMode`,
  `BirthAndDeath`,
  `Multiplayer`,
]);

export const EXTENSION_BASE_ID = `MAB2B`;
export const GOG_IDS = [`1802539526`, `1564781494`];
export const STEAMAPP_ID = 261550;
export const EPICAPP_ID = `Chickadee`;
export const XBOX_ID = `TaleWorldsEntertainment.MountBladeIIBannerlord`;

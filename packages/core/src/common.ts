import path from "path";

export const LOAD_ORDER_SUFFIX = `_loadorder.json`;
export const MULTIPLAYER_LOAD_ORDER_SUFFIX = `_loadorder_multiplayer.json`;

export const TW_LOGO = path.join(__dirname, `tw_logo.png`);
export const MODULE_LOGO = path.join(__dirname, `community_mod.png`);
export const STEAM_LOGO = path.join(__dirname, `steam.svg`);

export const GAME_ID = `mountandblade2bannerlord`;
export const I18N_NAMESPACE = `game-mount-and-blade2`;

/**
 * How deep a mod's staging folder is searched for SubModule.xml, deep enough for 'Modules/<Module>/SubModule.xml'
 */
export const SUBMODULE_SEARCH_DEPTH = 3;

export const SUB_MODS_IDS = `subModsIds`;
/**
 * What the Servers and Saves pages need about each module of a mod, so they don't read the staging folder
 */
export const SUB_MODS_INFO = `subModsInfo`;
/**
 * Raised when the stored module entries change shape, older entries are then read from the staging folder again
 */
export const SUB_MODS_INFO_SCHEMA = 1;
export const AVAILABLE_STORES = `availableStores`;
export const STEAM_BINARIES_ON_XBOX = `steamBinariesOnXbox`;
export const OBFUSCATED_BINARIES = `obfuscatedBinaries`;

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

/**
 * The profile feature holding the profile's type: true for Multiplayer, Singleplayer otherwise
 */
export const MULTIPLAYER_PROFILE_FEATURE = `bannerlord_multiplayer`;

/**
 * The profile feature that ties a profile to a server, by server id (host:port).
 * Keeping it on the profile means a deleted profile takes the link with it
 */
export const SERVER_PROFILE_FEATURE = `bannerlord_server`;

/**
 * The profile feature of the one profile shared by every server that runs without mods. It only enables the join
 * module, so a server without mods doesn't get a profile of its own
 */
export const NO_MODS_PROFILE_FEATURE = `bannerlord_server_no_mods`;

/**
 * What the extension sends as the User-Agent header with its requests
 */
export const USER_AGENT = `Vortex BUTR Extension v${__EXTENSION_VERSION__}`;

export const EXTENSION_BASE_ID = `MAB2B`;
export const GOG_IDS = [`1802539526`, `1564781494`];
export const STEAMAPP_ID = 261550;
export const EPICAPP_ID = `Chickadee`;
export const XBOX_ID = `TaleWorldsEntertainment.MountBladeIIBannerlord`;

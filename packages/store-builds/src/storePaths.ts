import os from "os";
import path from "path";
import * as winapi from "winapi-bindings";

/**
 * The stores' folders from the registry. Apart from the rest of the stores' code: winapi-bindings is native, it
 * can't be loaded in the verify worker, so the renderer reads these and passes them
 */

/**
 * Where Steam is installed, its depotcache has the manifests of games in the other libraries too. Vortex doesn't
 * tell extensions since 2.8
 */
export const getSteamPaths = (): string[] => {
  if (process.platform === "win32") {
    const paths: string[] = [];
    const keys = [
      ["HKEY_CURRENT_USER", "Software\\Valve\\Steam", "SteamPath"],
      [
        "HKEY_LOCAL_MACHINE",
        "SOFTWARE\\WOW6432Node\\Valve\\Steam",
        "InstallPath",
      ],
    ] as const;
    for (const [hive, key, name] of keys) {
      try {
        const { value } = winapi.RegGetValue(hive, key, name);
        if (typeof value === "string") {
          paths.push(value);
        }
      } catch {
        // Not set
      }
    }
    return paths;
  }

  const home = os.homedir();
  return [
    path.join(home, ".steam", "steam"),
    path.join(home, ".local", "share", "Steam"),
    path.join(
      home,
      ".var",
      "app",
      "com.valvesoftware.Steam",
      ".local",
      "share",
      "Steam",
    ),
  ];
};

// The current launcher is 64-bit and writes to the native registry view, older 32-bit ones were redirected to
// WOW6432Node. As Vortex's own lookup
const EPIC_LAUNCHER_KEYS = [
  "SOFTWARE\\Epic Games\\EpicGamesLauncher",
  "SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher",
];

/**
 * The Epic Games Launcher's data folder, which has the Manifests folder with its records of installed apps.
 * Undefined without the launcher
 */
export const getEpicDataPath = (): string | undefined => {
  if (process.platform !== "win32") {
    return undefined;
  }
  for (const key of EPIC_LAUNCHER_KEYS) {
    try {
      const { value } = winapi.RegGetValue(
        "HKEY_LOCAL_MACHINE",
        key,
        "AppDataPath",
      );
      if (typeof value === "string") {
        return value;
      }
    } catch {
      // Not set
    }
  }
  return undefined;
};

// Gaming Services' registration of the packages a game allows, its DLCs and the game's own, keyed
// "{repository}#{content id}", and where each one is installed
const XBOX_ALLOWED_PRODUCTS_KEY =
  "SOFTWARE\\Microsoft\\GamingServices\\PackageRegistration\\DLC\\AllowedProducts";
const XBOX_PACKAGE_REPOSITORY_KEY =
  "SOFTWARE\\Microsoft\\GamingServices\\PackageRepository\\Root";

const getSubkeys = (key: string): string[] => {
  let subkeys: string[] = [];
  try {
    winapi.WithRegOpen("HKEY_LOCAL_MACHINE", key, (hkey) => {
      subkeys = winapi.RegEnumKeys(hkey).map((subkey) => subkey.key);
    });
  } catch {
    // Not there
  }
  return subkeys;
};

/**
 * The folders of the Xbox packages installed for the game, its DLCs, each a package of its own in a folder next to
 * the game's. The game's own package is among them. Their WindowsApps junctions, to the packages' Content folders
 * @param productId The game's Store id, from readXboxProductIdAsync
 */
export const getXboxRelatedPackageRoots = (productId: string): string[] => {
  if (process.platform !== "win32" || productId === "") {
    return [];
  }
  const roots: string[] = [];
  for (const registration of getSubkeys(
    `${XBOX_ALLOWED_PRODUCTS_KEY}\\${productId}`,
  )) {
    const repository = `${XBOX_PACKAGE_REPOSITORY_KEY}\\${registration}`;
    for (const install of getSubkeys(repository)) {
      try {
        const { value } = winapi.RegGetValue(
          "HKEY_LOCAL_MACHINE",
          `${repository}\\${install}`,
          "Root",
        );
        if (typeof value === "string") {
          // A \\?\ path, Node doesn't need the prefix
          roots.push(value.replace(/^\\\\\?\\/, ""));
        }
      } catch {
        // Not set
      }
    }
  }
  return roots;
};

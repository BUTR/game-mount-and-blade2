import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEpicDataPath,
  getSteamPaths,
  getXboxRelatedPackageRoots,
} from "./storePaths";

const registry = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  keys: new Map<string, string[]>(),
}));

vi.mock("winapi-bindings", () => ({
  RegGetValue: (hive: string, key: string, name: string) => {
    const id = `${hive}\\${key}\\${name}`;
    if (!registry.values.has(id)) {
      throw new Error("not found");
    }
    return { type: "REG_SZ", value: registry.values.get(id) };
  },
  WithRegOpen: (
    hive: string,
    key: string,
    callback: (hkey: string) => void,
  ) => {
    const id = `${hive}\\${key}`;
    if (!registry.keys.has(id)) {
      throw new Error("not found");
    }
    callback(id);
  },
  RegEnumKeys: (hkey: string) =>
    (registry.keys.get(hkey) ?? []).map((key) => ({ key })),
}));

const HKLM = "HKEY_LOCAL_MACHINE";
const ALLOWED_PRODUCTS = `${HKLM}\\SOFTWARE\\Microsoft\\GamingServices\\PackageRegistration\\DLC\\AllowedProducts`;
const REPOSITORY = `${HKLM}\\SOFTWARE\\Microsoft\\GamingServices\\PackageRepository\\Root`;

const platform = process.platform;
const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, "platform", { value, configurable: true });
};

describe("storePaths on Windows", () => {
  beforeEach(() => {
    setPlatform("win32");
  });

  afterEach(() => {
    setPlatform(platform);
    registry.values.clear();
    registry.keys.clear();
  });

  it("reads Steam's folder from the user's and the machine's keys", () => {
    registry.values.set(
      "HKEY_CURRENT_USER\\Software\\Valve\\Steam\\SteamPath",
      "c:/program files (x86)/steam",
    );
    registry.values.set(
      `${HKLM}\\SOFTWARE\\WOW6432Node\\Valve\\Steam\\InstallPath`,
      "D:\\Steam",
    );

    expect(getSteamPaths()).toEqual([
      "c:/program files (x86)/steam",
      "D:\\Steam",
    ]);
  });

  it("skips Steam keys that aren't set or aren't text", () => {
    registry.values.set(
      "HKEY_CURRENT_USER\\Software\\Valve\\Steam\\SteamPath",
      42,
    );

    expect(getSteamPaths()).toEqual([]);
  });

  it("reads the Epic launcher's data folder, the 64-bit key first", () => {
    registry.values.set(
      `${HKLM}\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher\\AppDataPath`,
      "C:\\Old",
    );

    expect(getEpicDataPath()).toBe("C:\\Old");

    registry.values.set(
      `${HKLM}\\SOFTWARE\\Epic Games\\EpicGamesLauncher\\AppDataPath`,
      "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data",
    );

    expect(getEpicDataPath()).toBe(
      "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data",
    );
  });

  it("is undefined without the Epic launcher", () => {
    expect(getEpicDataPath()).toBe(undefined);
  });

  it("lists the folders of the packages registered for the game, without the \\\\?\\ prefix", () => {
    registry.keys.set(`${ALLOWED_PRODUCTS}\\9PDHWZ7X3P03`, [
      "Game#C5E01182",
      "Dlc#E09F018A",
      "Gone#00000000",
    ]);
    registry.keys.set(`${REPOSITORY}\\Game#C5E01182`, ["install1"]);
    registry.keys.set(`${REPOSITORY}\\Dlc#E09F018A`, ["install1", "install2"]);
    registry.values.set(
      `${REPOSITORY}\\Game#C5E01182\\install1\\Root`,
      "\\\\?\\C:\\Program Files\\WindowsApps\\Game_1.0.51.0_x64__mk53pm3ay0384",
    );
    registry.values.set(
      `${REPOSITORY}\\Dlc#E09F018A\\install1\\Root`,
      "C:\\Program Files\\WindowsApps\\Dlc_1.0.17.0_x64__mk53pm3ay0384",
    );

    expect(getXboxRelatedPackageRoots("9PDHWZ7X3P03")).toEqual([
      "C:\\Program Files\\WindowsApps\\Game_1.0.51.0_x64__mk53pm3ay0384",
      "C:\\Program Files\\WindowsApps\\Dlc_1.0.17.0_x64__mk53pm3ay0384",
    ]);
  });

  it("lists no package folders without the game's Store id or its registration", () => {
    registry.keys.set(`${ALLOWED_PRODUCTS}\\`, ["Game#C5E01182"]);

    expect(getXboxRelatedPackageRoots("")).toEqual([]);
    expect(getXboxRelatedPackageRoots("9PDHWZ7X3P03")).toEqual([]);
  });
});

describe("storePaths elsewhere", () => {
  beforeEach(() => {
    setPlatform("linux");
  });

  afterEach(() => {
    setPlatform(platform);
  });

  it("looks for Steam in its usual folders, the Flatpak's too", () => {
    const paths = getSteamPaths().map((folder) => folder.replace(/\\/g, "/"));

    expect(paths).toHaveLength(3);
    expect(paths[0]).toMatch(/\/\.steam\/steam$/);
    expect(paths[1]).toMatch(/\/\.local\/share\/Steam$/);
    expect(paths[2]).toMatch(
      /\/\.var\/app\/com\.valvesoftware\.Steam\/\.local\/share\/Steam$/,
    );
  });

  it("has no Epic launcher or Xbox packages", () => {
    expect(getEpicDataPath()).toBe(undefined);
    expect(getXboxRelatedPackageRoots("9PDHWZ7X3P03")).toEqual([]);
  });
});

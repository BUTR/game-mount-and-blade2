import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import path from "node:path";
import { installBLSEAsync, testBLSEAsync } from "./installer";
import { GAME_ID } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    currentGameDiscovery: (state: { discovery?: unknown }) => state.discovery,
  });
  return api;
});

const STANDARD = path.join("bin", "Win64_Shipping_Client");
const XBOX = path.join("bin", "Gaming.Desktop.x64_Shipping_Client");
const FILES = [
  `bin${path.sep}`,
  `${STANDARD}${path.sep}`,
  path.join(STANDARD, "Bannerlord.BLSE.Standalone.exe"),
  path.join(STANDARD, "Bannerlord.BLSE.Shared.dll"),
  `${XBOX}${path.sep}`,
  path.join(XBOX, "Bannerlord.BLSE.Standalone.exe"),
  "readme.txt",
];

const install = async (discovery?: { store?: string }) => {
  const api = {
    getState: () => ({ discovery }),
  } as unknown as types.IExtensionApi;
  const result = await installBLSEAsync(api, FILES);
  return result.instructions.map((instruction) => instruction.destination);
};

describe("installBLSEAsync", () => {
  it("installs only the binaries for the game's store", async () => {
    expect(await install({ store: "steam" })).toEqual([
      path.join(STANDARD, "Bannerlord.BLSE.Standalone.exe"),
      path.join(STANDARD, "Bannerlord.BLSE.Shared.dll"),
    ]);
    expect(await install({ store: "xbox" })).toEqual([
      path.join(XBOX, "Bannerlord.BLSE.Standalone.exe"),
    ]);
  });

  it("installs nothing before the game is discovered", async () => {
    expect(await install(undefined)).toEqual([]);
  });
});

describe("testBLSEAsync", () => {
  it("supports archives with BLSE's executable for Bannerlord", async () => {
    expect((await testBLSEAsync(FILES, GAME_ID)).supported).toBe(true);
    expect((await testBLSEAsync(FILES, "skyrimse")).supported).toBe(false);
    expect(
      (await testBLSEAsync(["Modules/Mod/SubModule.xml"], GAME_ID)).supported,
    ).toBe(false);
  });
});

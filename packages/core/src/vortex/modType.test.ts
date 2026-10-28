import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { getGameInstallPath, isModTypeModule } from "./modType";
import { GAME_ID } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    discoveryByGame: (
      state: { discovered: Record<string, unknown> },
      gameId: string,
    ) => state.discovered[gameId],
  });
  return api;
});

describe("getGameInstallPath", () => {
  const apiWith = (discovered: Record<string, unknown>) =>
    ({ getState: () => ({ discovered }) }) as unknown as types.IExtensionApi;
  const game = { id: GAME_ID } as types.IGame;

  it("is the game's discovered folder", () => {
    const api = apiWith({
      [GAME_ID]: { path: "C:\\Game" },
      skyrimse: { path: "C:\\Skyrim" },
    });

    expect(getGameInstallPath(api, game)).toBe("C:\\Game");
  });

  it("is empty until the game is discovered", () => {
    expect(getGameInstallPath(apiWith({}), game)).toBe("");
    expect(getGameInstallPath(apiWith({ [GAME_ID]: {} }), game)).toBe("");
  });
});

describe("isModTypeModule", () => {
  const copy = (destination?: string): types.IInstruction => ({
    type: "copy",
    source: destination ?? "",
    ...(destination !== undefined && { destination }),
  });

  it("is a module when a SubModule.xml is installed", () => {
    expect(
      isModTypeModule([
        copy("Modules/Mod/readme.txt"),
        copy("Modules/Mod/SubModule.xml"),
      ]),
    ).toBe(true);
  });

  it("accepts the file in any case, like the translation installer does", () => {
    expect(isModTypeModule([copy("Modules\\Mod\\submodule.xml")])).toBe(true);
    expect(isModTypeModule([copy("Modules/Mod/SUBMODULE.XML")])).toBe(true);
  });

  it("isn't one without a SubModule.xml copied", () => {
    expect(isModTypeModule([])).toBe(false);
    expect(isModTypeModule([copy("Modules/Mod/ModuleData/x.xml")])).toBe(false);
    expect(isModTypeModule([copy()])).toBe(false);
    expect(
      isModTypeModule([
        { type: "attribute", key: "x", value: "Modules/Mod/SubModule.xml" },
      ]),
    ).toBe(false);
  });
});

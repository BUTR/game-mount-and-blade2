import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  checkBLSEDeploy,
  checkHarmonyDeploy,
  checkModDeploy,
  DeployModStatus,
} from "./modDeploy";
import { isModTypeBLSE } from "./modType";
import { GAME_ID } from "../common";
import { IBannerlordMod } from "../types";

vi.mock("@butr/vortexextensionnative", () => ({}));

const profile = (enabled: string[]) =>
  ({
    id: "p1",
    gameId: GAME_ID,
    modState: Object.fromEntries(enabled.map((id) => [id, { enabled: true }])),
  }) as unknown as types.IProfile;

const mod = (id: string, attributes: Record<string, unknown> = {}, type = "") =>
  ({ id, type, attributes }) as unknown as IBannerlordMod;

const apiWithDownloads = (files: Record<string, unknown> = {}) =>
  ({
    getState: () => ({ persistent: { downloads: { files } } }),
  }) as unknown as types.IExtensionApi;

const nexusDownload = (modId: number) => ({
  state: "finished",
  game: [GAME_ID],
  fileTime: 0,
  modInfo: { nexus: { ids: { modId, fileId: 1 } } },
});

describe("checkModDeploy", () => {
  it("needs a download without the mod or its archive", () => {
    expect(checkModDeploy(profile([]), undefined, undefined)).toEqual({
      status: DeployModStatus.NOT_DOWNLOADED,
    });
  });

  it("needs an install with only the archive", () => {
    expect(checkModDeploy(profile([]), undefined, "dl")).toEqual({
      status: DeployModStatus.NOT_INSTALLED,
      downloadId: "dl",
    });
  });

  it("needs enabling when the profile doesn't enable the mod", () => {
    expect(checkModDeploy(profile([]), mod("harmony"), "dl")).toEqual({
      status: DeployModStatus.NOT_ENABLED,
      modId: "harmony",
    });
  });

  it("is OK when the profile enables the mod", () => {
    expect(
      checkModDeploy(profile(["harmony"]), mod("harmony"), undefined),
    ).toEqual({ status: DeployModStatus.OK });
  });
});

describe("checkHarmonyDeploy", () => {
  it("finds Harmony by its module and its download by its Nexus Mods page", () => {
    const harmony = mod("harmony", { subModsIds: ["Bannerlord.Harmony"] });

    expect(
      checkHarmonyDeploy(apiWithDownloads(), profile(["harmony"]), { harmony }),
    ).toEqual({ status: DeployModStatus.OK });
    expect(
      checkHarmonyDeploy(
        apiWithDownloads({
          blse: nexusDownload(1),
          harmony: nexusDownload(2006),
        }),
        profile([]),
        {},
      ),
    ).toEqual({ status: DeployModStatus.NOT_INSTALLED, downloadId: "harmony" });
  });
});

describe("checkBLSEDeploy", () => {
  it("finds BLSE by its mod type and its download by its Nexus Mods page", () => {
    const blse = mod("blse", {}, "bannerlord-blse");

    expect(checkBLSEDeploy(apiWithDownloads(), profile([]), { blse })).toEqual({
      status: DeployModStatus.NOT_ENABLED,
      modId: "blse",
    });
    expect(
      checkBLSEDeploy(
        apiWithDownloads({
          harmony: nexusDownload(2006),
          blse: nexusDownload(1),
        }),
        profile([]),
        {},
      ),
    ).toEqual({ status: DeployModStatus.NOT_INSTALLED, downloadId: "blse" });
    expect(
      checkBLSEDeploy(
        apiWithDownloads({ harmony: nexusDownload(2006) }),
        profile([]),
        {},
      ),
    ).toEqual({ status: DeployModStatus.NOT_DOWNLOADED });
  });
});

describe("isModTypeBLSE", () => {
  it("recognizes an install that copies BLSE's executable", () => {
    expect(
      isModTypeBLSE([
        {
          type: "copy",
          source: "bin/Win64_Shipping_Client/Bannerlord.BLSE.Standalone.exe",
          destination:
            "bin/Win64_Shipping_Client/Bannerlord.BLSE.Standalone.exe",
        },
      ]),
    ).toBe(true);
    expect(
      isModTypeBLSE([
        {
          type: "attribute",
          key: "source",
          value: "Bannerlord.BLSE.Standalone.exe",
        },
        { type: "copy", source: "Modules/Mod/SubModule.xml" },
      ]),
    ).toBe(false);
  });
});

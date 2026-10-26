import { describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { didDeployBLSEAsync, didPurgeBLSEAsync } from "./events";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    activeProfile: () => ({ id: "p1" }),
  });
  Object.assign(api.actions, {
    setPrimaryTool: (_gameId: string, toolId: string | undefined) => ({
      type: "SET_PRIMARY_TOOL",
      toolId,
    }),
  });
  return api;
});
vi.mock("@butr/vortexextensionnative", () => ({}));

const run = async (
  event: (api: types.IExtensionApi) => Promise<void>,
  options: {
    blse: boolean;
    primaryTool?: string | null;
    gameMode?: "singleplayer" | "multiplayer";
  },
) => {
  const dispatched: { type: string; toolId: string | undefined }[] = [];
  const api = {
    getState: () => ({
      persistent: {
        profiles: {
          p1: {
            features: {
              [MULTIPLAYER_PROFILE_FEATURE]: options.gameMode === "multiplayer",
            },
          },
        },
        mods: {
          [GAME_ID]: options.blse
            ? { blse: { id: "blse", type: "bannerlord-blse" } }
            : {},
        },
      },
      settings: {
        interface: { primaryTool: { [GAME_ID]: options.primaryTool } },
      },
    }),
    store: {
      dispatch: (action: (typeof dispatched)[number]) =>
        dispatched.push(action),
    },
  } as unknown as types.IExtensionApi;
  await event(api);
  return dispatched.map((action) => action.toolId);
};

describe("didDeployBLSEAsync", () => {
  it("makes BLSE the primary tool when none was chosen", async () => {
    expect(await run(didDeployBLSEAsync, { blse: true })).toEqual(["blse-cli"]);
  });

  it("keeps the user's choice, the game itself included", async () => {
    expect(
      await run(didDeployBLSEAsync, { blse: true, primaryTool: null }),
    ).toEqual([]);
    expect(
      await run(didDeployBLSEAsync, {
        blse: true,
        primaryTool: "vanilla-launcher",
      }),
    ).toEqual([]);
  });

  it("unsets BLSE as the primary tool once BLSE is gone", async () => {
    expect(
      await run(didDeployBLSEAsync, { blse: false, primaryTool: "blse-cli" }),
    ).toEqual([undefined]);
  });

  it("leaves the multiplayer mode's tool alone", async () => {
    expect(
      await run(didDeployBLSEAsync, { blse: true, gameMode: "multiplayer" }),
    ).toEqual([]);
  });
});

describe("didPurgeBLSEAsync", () => {
  it("unsets BLSE as the primary tool once its files are gone", async () => {
    expect(
      await run(didPurgeBLSEAsync, { blse: true, primaryTool: "blse-cli" }),
    ).toEqual([undefined]);
  });

  it("keeps any other primary tool", async () => {
    expect(
      await run(didPurgeBLSEAsync, { blse: true, primaryTool: "vanilla-cli" }),
    ).toEqual([]);
    expect(
      await run(didPurgeBLSEAsync, {
        blse: true,
        primaryTool: "blse-cli",
        gameMode: "multiplayer",
      }),
    ).toEqual([]);
  });
});

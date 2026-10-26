import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, types, util } from "@nexusmods/vortex-api";
import {
  deployBLSEAsync,
  downloadBLSEAsync,
  downloadHarmonyAsync,
  findBLSEDownload,
} from "./utils";
import { deployModsAsync } from "../vortex/deploy";
import { downloadAndEnableLatestModVersionAsync } from "../vortex/modDownloader";
import { actionsSettings } from "../settings/actions";
import {
  BLSE_MOD_ID,
  BLSE_URL,
  GAME_ID,
  HARMONY_MOD_ID,
  HARMONY_URL,
  MULTIPLAYER_PROFILE_FEATURE,
} from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    activeProfile: (state: { profile?: unknown }) => state.profile,
    currentGameDiscovery: (state: { discovery?: unknown }) => state.discovery,
  });
  Object.assign(api.actions, {
    setPrimaryTool: vi.fn((gameId: string, toolId: string) => ({
      type: "SET_PRIMARY_TOOL",
      payload: { gameId, toolId },
    })),
  });
  Object.assign(api.util, {
    toPromise: (func: (cb: (err: unknown, res: unknown) => void) => void) =>
      new Promise((resolve, reject) =>
        func((err, res) => (err ? reject(err) : resolve(res))),
      ),
    opn: vi.fn(() => Promise.resolve()),
  });
  return api;
});
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));
vi.mock("../vortex/deploy", () => ({
  deployModsAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("../vortex/modDownloader", () => ({
  downloadAndEnableLatestModVersionAsync: vi.fn(() => Promise.resolve()),
}));

interface Options {
  gameMode?: "singleplayer" | "multiplayer";
  tool?: { id: string };
  downloads?: Record<string, unknown>;
}

const makeApi = (options: Options = {}) => {
  const events: string[] = [];
  const api = {
    getState: () => ({
      profile: { id: "p1", gameId: GAME_ID },
      discovery: {
        tools: options.tool !== undefined ? { "blse-cli": options.tool } : {},
      },
      persistent: {
        profiles: {
          p1: {
            features: {
              [MULTIPLAYER_PROFILE_FEATURE]: options.gameMode === "multiplayer",
            },
          },
        },
        downloads: { files: options.downloads ?? {} },
      },
      settings: {},
    }),
    events: {
      emit: vi.fn((event: string, callback: () => void) => {
        events.push(event);
        callback();
      }),
    },
    store: { dispatch: vi.fn() },
    sendNotification: vi.fn(),
    dismissNotification: vi.fn(),
    showErrorNotification: vi.fn(),
    ext: { ensureLoggedIn: vi.fn(() => Promise.resolve()) },
  };
  return { api: api as unknown as types.IExtensionApi, raw: api, events };
};

const nexusDownload = (modId: number, fileTime: number) => ({
  state: "finished",
  game: [GAME_ID],
  fileTime,
  modInfo: { nexus: { ids: { modId, fileId: 1 } } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findBLSEDownload", () => {
  it("finds the newest finished download of BLSE's Nexus Mods page", () => {
    const { api } = makeApi({
      downloads: {
        old: nexusDownload(BLSE_MOD_ID, 1),
        harmony: nexusDownload(HARMONY_MOD_ID, 3),
        newest: nexusDownload(BLSE_MOD_ID, 2),
      },
    });

    expect(findBLSEDownload(api)).toBe("newest");
    expect(findBLSEDownload(makeApi().api)).toBeUndefined();
  });
});

describe("deployBLSEAsync", () => {
  it("deploys, rediscovers the tools and makes BLSE the primary tool in singleplayer", async () => {
    const { api, raw, events } = makeApi({ tool: { id: "blse-cli" } });

    await deployBLSEAsync(api);

    expect(deployModsAsync).toHaveBeenCalledWith(api);
    expect(events).toEqual(["start-quick-discovery"]);
    expect(actions.setPrimaryTool).toHaveBeenCalledWith(GAME_ID, "blse-cli");
    expect(raw.store.dispatch).toHaveBeenCalledWith(
      actions.setPrimaryTool(GAME_ID, "blse-cli"),
    );
  });

  it("in multiplayer, remembers BLSE as the singleplayer mode's tool instead", async () => {
    const { api, raw } = makeApi({
      gameMode: "multiplayer",
      tool: { id: "blse-cli" },
    });

    await deployBLSEAsync(api);

    expect(actions.setPrimaryTool).not.toHaveBeenCalled();
    expect(raw.store.dispatch).toHaveBeenCalledWith(
      actionsSettings.setModePrimaryTool("singleplayer", "blse-cli"),
    );
  });

  it("changes no tool while BLSE's tool isn't discovered", async () => {
    const { api, raw } = makeApi();

    await deployBLSEAsync(api);

    expect(raw.store.dispatch).not.toHaveBeenCalled();
  });
});

describe("downloadBLSEAsync", () => {
  it("downloads and deploys BLSE behind an activity notification", async () => {
    const { api, raw } = makeApi({ tool: { id: "blse-cli" } });

    await downloadBLSEAsync(api);

    expect(raw.dismissNotification.mock.calls).toEqual([
      ["blse-missing"],
      ["blse-installing"],
    ]);
    expect(raw.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "blse-installing",
        message: "Installing BLSE",
        type: "activity",
      }),
    );
    expect(raw.ext.ensureLoggedIn).toHaveBeenCalledTimes(1);
    expect(downloadAndEnableLatestModVersionAsync).toHaveBeenCalledWith(
      api,
      BLSE_MOD_ID,
    );
    expect(deployModsAsync).toHaveBeenCalledTimes(1);
    expect(raw.showErrorNotification).not.toHaveBeenCalled();
  });

  it("says it is updating when asked to", async () => {
    const { api, raw } = makeApi();

    await downloadBLSEAsync(api, true);

    expect(raw.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Updating BLSE" }),
    );
  });

  it("reports a failed download, opens BLSE's page and still removes the activity", async () => {
    const { api, raw } = makeApi();
    const failure = new Error("offline");
    vi.mocked(downloadAndEnableLatestModVersionAsync).mockRejectedValueOnce(
      failure,
    );

    await expect(downloadBLSEAsync(api)).resolves.toBeUndefined();

    expect(raw.showErrorNotification).toHaveBeenCalledWith(
      "Failed to download/install BLSE",
      failure,
    );
    expect(util.opn).toHaveBeenCalledWith(BLSE_URL);
    expect(deployModsAsync).not.toHaveBeenCalled();
    expect(raw.dismissNotification).toHaveBeenLastCalledWith("blse-installing");
  });
});

describe("downloadHarmonyAsync", () => {
  it("downloads Harmony behind an activity notification, without deploying", async () => {
    const { api, raw } = makeApi();

    await downloadHarmonyAsync(api);

    expect(raw.dismissNotification.mock.calls).toEqual([
      ["harmony-missing"],
      ["harmony-installing"],
    ]);
    expect(raw.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "harmony-installing",
        message: "Installing Harmony",
      }),
    );
    expect(downloadAndEnableLatestModVersionAsync).toHaveBeenCalledWith(
      api,
      HARMONY_MOD_ID,
    );
    expect(deployModsAsync).not.toHaveBeenCalled();
  });

  it("reports a failed download and still removes the activity", async () => {
    const { api, raw } = makeApi();
    vi.mocked(downloadAndEnableLatestModVersionAsync).mockRejectedValueOnce(
      new Error("offline"),
    );

    await downloadHarmonyAsync(api);

    expect(raw.showErrorNotification).toHaveBeenCalledWith(
      "Failed to download/install Harmony",
      expect.any(Error),
    );
    expect(util.opn).toHaveBeenCalledExactlyOnceWith(HARMONY_URL);
    expect(raw.dismissNotification).toHaveBeenLastCalledWith(
      "harmony-installing",
    );
  });
});

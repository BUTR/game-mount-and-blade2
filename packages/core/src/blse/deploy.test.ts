import { beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import {
  recommendBLSEAsync,
  resolveModDeployAsync,
  setUpBLSEAsync,
  setUpHarmonyAsync,
} from "./deploy";
import { DeployModStatus } from "./modDeploy";
import { downloadBLSEAsync, downloadHarmonyAsync } from "./utils";
import { enableModsAsync } from "../vortex/deploy";
import { installAndEnableDownloadAsync } from "../vortex/modDownloader";
import { getPathExistsAsync } from "../fsUtils";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  Object.assign(api.selectors, {
    activeProfile: (state: { profile?: unknown }) => state.profile,
  });
  return api;
});
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));
vi.mock("../fsUtils", () => ({
  getPathExistsAsync: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("../vortex/deploy", () => ({
  enableModsAsync: vi.fn(() => Promise.resolve()),
  deployModsAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("../vortex/modDownloader", () => ({
  installAndEnableDownloadAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("./utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils")>()),
  deployBLSEAsync: vi.fn(() => Promise.resolve()),
  downloadBLSEAsync: vi.fn(() => Promise.resolve()),
  downloadHarmonyAsync: vi.fn(() => Promise.resolve()),
}));

type ModState = "enabled" | "disabled" | "downloaded" | "missing";

interface Options {
  blse?: ModState;
  harmony?: ModState;
  gameMode?: "singleplayer" | "multiplayer";
  noProfile?: boolean;
}

const makeState = (options: Options) => {
  const blse = options.blse ?? "enabled";
  const harmony = options.harmony ?? "enabled";
  const installed = (state: ModState) =>
    state === "enabled" || state === "disabled";
  const download = (modId: number) => ({
    state: "finished",
    game: [GAME_ID],
    fileTime: 0,
    modInfo: { nexus: { ids: { modId, fileId: 1 } } },
  });
  return {
    profile: options.noProfile
      ? undefined
      : {
          id: "p1",
          gameId: GAME_ID,
          modState: {
            blse: { enabled: blse === "enabled" },
            harmony: { enabled: harmony === "enabled" },
          },
        },
    persistent: {
      profiles: {
        p1: {
          features: {
            [MULTIPLAYER_PROFILE_FEATURE]: options.gameMode === "multiplayer",
          },
        },
      },
      mods: {
        [GAME_ID]: {
          ...(installed(blse) && {
            blse: { id: "blse", type: "bannerlord-blse" },
          }),
          ...(installed(harmony) && {
            harmony: {
              id: "harmony",
              type: "",
              attributes: { subModsIds: ["Bannerlord.Harmony"] },
            },
          }),
        },
      },
      downloads: {
        files: {
          ...(blse !== "missing" && { "blse-dl": download(1) }),
          ...(harmony !== "missing" && { "harmony-dl": download(2006) }),
        },
      },
    },
    settings: {},
    session: {},
  };
};

type Notification = {
  id: string;
  title: string;
  actions: { title: string; action: (dismiss: () => void) => void }[];
};

const makeApi = (options: Options) => {
  const api = {
    getState: () => makeState(options),
    sendNotification: vi.fn<(notification: Notification) => void>(),
    dismissNotification: vi.fn(),
    showErrorNotification: vi.fn(),
  };
  return api;
};

const recommend = async (options: Options) => {
  const api = makeApi(options);
  await recommendBLSEAsync(
    api as unknown as types.IExtensionApi,
    {
      path: "C:\\Game",
      store: "steam",
    } as types.IDiscoveryResult,
  );
  return {
    api,
    notifications: api.sendNotification.mock.calls.map(([notification]) => ({
      id: notification.id,
      title: notification.title,
      action: notification.actions[0]?.title,
    })),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPathExistsAsync).mockResolvedValue(true);
});

describe("recommendBLSEAsync", () => {
  it("recommends nothing when BLSE and Harmony are enabled", async () => {
    const { api, notifications } = await recommend({});

    expect(notifications).toEqual([]);
    expect(api.dismissNotification).toHaveBeenCalledWith("blse-missing");
    expect(api.dismissNotification).toHaveBeenCalledWith("harmony-missing");
  });

  it("recommends nothing for a multiplayer profile", async () => {
    const { notifications } = await recommend({
      gameMode: "multiplayer",
      blse: "missing",
      harmony: "missing",
    });

    expect(notifications).toEqual([]);
  });

  it("recommends nothing without an active profile", async () => {
    const { notifications } = await recommend({
      noProfile: true,
      blse: "missing",
    });

    expect(notifications).toEqual([]);
  });

  it.each([
    ["missing", "BLSE is not installed via Vortex", "Get BLSE"],
    ["downloaded", "BLSE is not installed", "Install"],
    ["disabled", "BLSE is not enabled", "Enable"],
  ] as const)(
    "tells what BLSE still needs when it is %s",
    async (blse, title, action) => {
      const { notifications } = await recommend({ blse });

      expect(notifications).toEqual([{ id: "blse-missing", title, action }]);
    },
  );

  it("asks for Harmony only once BLSE is in place", async () => {
    expect((await recommend({ harmony: "disabled" })).notifications).toEqual([
      {
        id: "harmony-missing",
        title: "Harmony is not enabled",
        action: "Enable",
      },
    ]);
    expect(
      (await recommend({ harmony: "missing", blse: "disabled" })).notifications,
    ).toEqual([
      { id: "blse-missing", title: "BLSE is not enabled", action: "Enable" },
    ]);
  });

  it("reports a failed setup from the notification's button and dismisses it", async () => {
    const { api } = await recommend({ harmony: "missing" });
    const dismiss = vi.fn();

    api.sendNotification.mock.calls[0]?.[0].actions[0]?.action(dismiss);
    await vi.waitFor(() => expect(dismiss).toHaveBeenCalled());

    expect(downloadHarmonyAsync).toHaveBeenCalled();
    expect(api.showErrorNotification).toHaveBeenCalledWith(
      "Failed to set up Harmony",
      expect.any(Error),
      { allowReport: false },
    );
  });
});

describe("resolveModDeployAsync", () => {
  const profile = { id: "p1" } as types.IProfile;
  const api = {} as types.IExtensionApi;

  const resolve = async (result: {
    status: DeployModStatus;
    modId?: string;
    downloadId?: string;
  }) => {
    const download = vi.fn(() => Promise.resolve());
    const deploy = vi.fn(() => Promise.resolve());
    await resolveModDeployAsync(api, profile, result, download, deploy);
    return { download, deploy };
  };

  it("downloads a mod that was never downloaded", async () => {
    const { download, deploy } = await resolve({
      status: DeployModStatus.NOT_DOWNLOADED,
    });

    expect(download).toHaveBeenCalledTimes(1);
    expect(deploy).not.toHaveBeenCalled();
  });

  it("installs the downloaded archive, then deploys", async () => {
    const { deploy } = await resolve({
      status: DeployModStatus.NOT_INSTALLED,
      downloadId: "dl",
    });

    expect(installAndEnableDownloadAsync).toHaveBeenCalledWith(api, "dl");
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("enables the installed mod in the profile, then deploys", async () => {
    const { deploy } = await resolve({
      status: DeployModStatus.NOT_ENABLED,
      modId: "harmony",
    });

    expect(enableModsAsync).toHaveBeenCalledWith(api, "p1", ["harmony"]);
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the mod is in place or the result lacks its id", async () => {
    const results = [
      await resolve({ status: DeployModStatus.OK }),
      await resolve({ status: DeployModStatus.NOT_INSTALLED }),
      await resolve({ status: DeployModStatus.NOT_ENABLED }),
    ];

    for (const { download, deploy } of results) {
      expect(download).not.toHaveBeenCalled();
      expect(deploy).not.toHaveBeenCalled();
    }
    expect(installAndEnableDownloadAsync).not.toHaveBeenCalled();
    expect(enableModsAsync).not.toHaveBeenCalled();
  });
});

describe("setUpBLSEAsync", () => {
  it("rejects when Harmony is still missing after its download, without touching BLSE", async () => {
    const api = makeApi({ harmony: "missing", blse: "missing" });

    await expect(
      setUpHarmonyAsync(api as unknown as types.IExtensionApi),
    ).rejects.toThrow("Harmony could not be set up");
    await expect(
      setUpBLSEAsync(api as unknown as types.IExtensionApi),
    ).rejects.toThrow("Harmony could not be set up");
    expect(downloadBLSEAsync).not.toHaveBeenCalled();
  });

  it("sets up BLSE once Harmony is in place", async () => {
    const api = makeApi({ blse: "missing" });

    await setUpBLSEAsync(api as unknown as types.IExtensionApi);

    expect(downloadHarmonyAsync).not.toHaveBeenCalled();
    expect(downloadBLSEAsync).toHaveBeenCalledTimes(1);
  });
});

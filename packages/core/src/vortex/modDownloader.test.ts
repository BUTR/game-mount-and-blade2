import { beforeEach, describe, expect, it, vi } from "vitest";
import { types, util } from "@nexusmods/vortex-api";
import {
  downloadAndEnableModFileAsync,
  installAndEnableDownloadAsync,
} from "./modDownloader";
import { enableModsAsync } from "./deploy";
import { GAME_ID } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  class ProcessCanceled extends Error {}
  Object.assign(api.util, {
    ProcessCanceled,
    toPromise: <T>(fn: (cb: (err: unknown, value: T) => void) => void) =>
      new Promise<T>((resolve) => fn((_err, value) => resolve(value))),
  });
  Object.assign(api.selectors, {
    activeProfile: (state: { activeProfile?: { id: string } }) =>
      state.activeProfile,
  });
  return api;
});

vi.mock("@butr/vortexextensionnative", () => ({}));

vi.mock("./deploy", () => ({
  enableModsAsync: vi.fn(() => Promise.resolve()),
}));

const file = (
  file_id: number,
  category_id: number,
  uploaded_timestamp: number,
) => ({ file_id, category_id, uploaded_timestamp, name: `file ${file_id}` });

const makeApi = (
  // undefined for a Vortex without the Nexus Mods integration
  modFiles: ReturnType<typeof file>[] | undefined,
  downloads: Record<string, unknown> = {},
  options: { activeProfile?: boolean } = {},
) => {
  const events: { event: string; args: unknown[] }[] = [];
  const api = {
    getState: () => ({
      persistent: { downloads: { files: downloads } },
      ...(options.activeProfile !== false && {
        activeProfile: { id: "active" },
      }),
    }),
    ext:
      modFiles !== undefined
        ? { nexusGetModFiles: () => Promise.resolve(modFiles) }
        : {},
    events: {
      emit: (event: string, ...args: unknown[]) => {
        events.push({ event, args });
        const cb = args.find((arg) => typeof arg === "function") as (
          err: null,
          value: string,
        ) => void;
        cb(null, event === "start-download" ? "new-download" : "installed-mod");
      },
    },
  };
  return { api: api as unknown as types.IExtensionApi, events };
};

const downloadedUrl = (events: { event: string; args: unknown[] }[]) =>
  (
    events.find((entry) => entry.event === "start-download")?.args[0] as
      | string[]
      | undefined
  )?.[0];

const installedDownload = (events: { event: string; args: unknown[] }[]) =>
  events.find((entry) => entry.event === "start-install-download")?.args[0];

beforeEach(() => {
  vi.mocked(enableModsAsync).mockClear();
});

describe("downloadAndEnableModFileAsync", () => {
  it("downloads the most recently uploaded main file", async () => {
    const { api, events } = makeApi([
      file(10, 1, 1000),
      file(30, 1, 3000),
      file(20, 1, 2000),
      file(40, 3, 4000),
    ]);

    await downloadAndEnableModFileAsync(api, 2006, null);

    expect(downloadedUrl(events)).toBe(`nxm://${GAME_ID}/mods/2006/files/30`);
    const download = events.find((entry) => entry.event === "start-download");
    expect(download?.args[1]).toEqual({ game: GAME_ID, name: "file 30" });
    // It is installed below, an automatic install would install it twice
    expect(download?.args[5]).toEqual({ allowInstall: false });
    expect(installedDownload(events)).toBe("new-download");
    expect(enableModsAsync).toHaveBeenCalledWith(
      api,
      "active",
      ["installed-mod"],
      { installed: true },
    );
  });

  it("downloads the file asked for, main or not", async () => {
    const { api, events } = makeApi([file(10, 1, 1000), file(40, 3, 4000)]);

    await downloadAndEnableModFileAsync(api, 2006, 40, "target");

    expect(downloadedUrl(events)).toBe(`nxm://${GAME_ID}/mods/2006/files/40`);
    expect(enableModsAsync).toHaveBeenCalledWith(
      api,
      "target",
      ["installed-mod"],
      { installed: true },
    );
  });

  it("installs an earlier download of the file instead of downloading it again", async () => {
    const { api, events } = makeApi([file(30, 1, 3000)], {
      earlier: {
        state: "finished",
        game: [GAME_ID],
        fileTime: 1,
        modInfo: { nexus: { ids: { modId: 2006, fileId: 30 } } },
      },
    });

    await downloadAndEnableModFileAsync(api, 2006, null);

    expect(downloadedUrl(events)).toBeUndefined();
    expect(installedDownload(events)).toBe("earlier");
  });

  it("passes the target profile to the install, so a reinstall checks it", async () => {
    const { api, events } = makeApi([file(30, 1, 3000)]);

    await downloadAndEnableModFileAsync(api, 2006, null, "target");

    const install = events.find(
      (entry) => entry.event === "start-install-download",
    );
    expect(install?.args[1]).toEqual({
      allowAutoEnable: false,
      profileId: "target",
    });
  });

  it("is canceled when there is no such file", async () => {
    await expect(
      downloadAndEnableModFileAsync(
        makeApi([file(40, 3, 4000)]).api,
        2006,
        null,
      ),
    ).rejects.toBeInstanceOf(util.ProcessCanceled);
    await expect(
      downloadAndEnableModFileAsync(makeApi([file(10, 1, 1000)]).api, 2006, 99),
    ).rejects.toBeInstanceOf(util.ProcessCanceled);
  });

  it("is canceled on a Vortex without the Nexus Mods integration", async () => {
    const { api, events } = makeApi(undefined);

    await expect(
      downloadAndEnableModFileAsync(api, 2006, null),
    ).rejects.toBeInstanceOf(util.ProcessCanceled);
    expect(events).toEqual([]);
  });
});

describe("installAndEnableDownloadAsync", () => {
  it("enables the installed mod in the active profile when none is given", async () => {
    const { api, events } = makeApi([]);

    await installAndEnableDownloadAsync(api, "dl");

    expect(installedDownload(events)).toBe("dl");
    expect(enableModsAsync).toHaveBeenCalledWith(
      api,
      "active",
      ["installed-mod"],
      { installed: true },
    );
  });

  it("fails without an active profile, before installing anything", async () => {
    const { api, events } = makeApi([], {}, { activeProfile: false });

    await expect(installAndEnableDownloadAsync(api, "dl")).rejects.toThrow(
      "Active profile",
    );
    expect(events).toEqual([]);
    expect(enableModsAsync).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { util } from "@nexusmods/vortex-api";
import {
  downloadServerMapAsync as downloadMapAsync,
  ILocalScene,
  IMapDownloadOptions,
  InvalidMapError,
  NotDownloadedMapError,
  removeDownloadedMapAsync as removeMapAsync,
} from "@bannerlord/server-maps";
import { USER_AGENT } from "@bannerlord/core/common";
import { downloadServerMapAsync, removeDownloadedMapAsync } from "./maps";

const sevenZip = vi.hoisted(() => ({
  list: vi.fn(async () => undefined),
  extractFull: vi.fn(async () => undefined),
}));

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  util: {
    DataInvalid: class DataInvalid extends Error {},
    ProcessCanceled: class ProcessCanceled extends Error {},
    SevenZip: class SevenZip {
      public list = sevenZip.list;
      public extractFull = sevenZip.extractFull;
    },
  },
}));

vi.mock("@bannerlord/server-maps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bannerlord/server-maps")>()),
  downloadServerMapAsync: vi.fn(),
  removeDownloadedMapAsync: vi.fn(),
}));

const SERVER = { address: "203.0.113.7", port: 7210 };
const MAP = { name: "custom_map", uniqueToken: null, revision: null };
const SCENE: ILocalScene = {
  name: "custom_map",
  module: "Multiplayer",
  path: "C:\\Game\\Modules\\Multiplayer\\SceneObj\\custom_map",
  uniqueToken: null,
  revision: null,
};

beforeEach(() => {
  vi.mocked(downloadMapAsync).mockReset();
  vi.mocked(removeMapAsync).mockReset();
});

describe("downloadServerMapAsync", () => {
  it("downloads with the extension's user agent and Vortex's 7-Zip, forced to zip", async () => {
    vi.mocked(downloadMapAsync).mockResolvedValue("C:\\target");

    await expect(downloadServerMapAsync("C:\\Game", SERVER, MAP)).resolves.toBe(
      "C:\\target",
    );

    const options = vi.mocked(downloadMapAsync).mock
      .calls[0]?.[3] as IMapDownloadOptions;
    expect(options.userAgent).toBe(USER_AGENT);
    const onEntries = vi.fn();
    await options.archiver.list("map.zip", onEntries);
    await options.archiver.extractFull("map.zip", "C:\\out");
    expect(sevenZip.list).toHaveBeenCalledWith(
      "map.zip",
      { t: "zip" },
      onEntries,
    );
    expect(sevenZip.extractFull).toHaveBeenCalledWith("map.zip", "C:\\out", {
      t: "zip",
    });
  });

  it("reports a bad map archive as invalid data, not as a bug", async () => {
    vi.mocked(downloadMapAsync).mockRejectedValue(
      new InvalidMapError("not a map"),
    );

    const promise = downloadServerMapAsync("C:\\Game", SERVER, MAP);

    await expect(promise).rejects.toBeInstanceOf(util.DataInvalid);
    await expect(promise).rejects.toThrow("not a map");
  });

  it("passes other errors through", async () => {
    const error = new Error("ECONNRESET");
    vi.mocked(downloadMapAsync).mockRejectedValue(error);

    await expect(downloadServerMapAsync("C:\\Game", SERVER, MAP)).rejects.toBe(
      error,
    );
  });
});

describe("removeDownloadedMapAsync", () => {
  it("reports a scene outside the download cache as cancelled", async () => {
    vi.mocked(removeMapAsync).mockRejectedValue(
      new NotDownloadedMapError("not downloaded"),
    );

    await expect(
      removeDownloadedMapAsync("C:\\Game", SCENE),
    ).rejects.toBeInstanceOf(util.ProcessCanceled);
  });

  it("passes other errors through", async () => {
    const error = new Error("EBUSY");
    vi.mocked(removeMapAsync).mockRejectedValue(error);

    await expect(removeDownloadedMapAsync("C:\\Game", SCENE)).rejects.toBe(
      error,
    );
  });

  it("removes the scene", async () => {
    vi.mocked(removeMapAsync).mockResolvedValue(undefined);

    await removeDownloadedMapAsync("C:\\Game", SCENE);

    expect(removeMapAsync).toHaveBeenCalledWith("C:\\Game", SCENE);
  });
});

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { types } from "@nexusmods/vortex-api";
import { getSaveDetailsByNameAsync } from "./details";

const mocks = vi.hoisted(() => ({
  readSaveDetailsInWorkerAsync: vi.fn<(filePath: string) => Promise<unknown>>(),
  getSaveFilePathAsync:
    vi.fn<(saveName: string) => Promise<string | undefined>>(),
}));

vi.mock("@bannerlord/save-file", () => ({
  readSaveDetailsInWorkerAsync: mocks.readSaveDetailsInWorkerAsync,
}));

vi.mock("@bannerlord/core/launcher/manager", () => ({
  VortexLauncherManager: {
    getInstance: () => ({ getSaveFilePathAsync: mocks.getSaveFilePathAsync }),
  },
}));

const api = {} as types.IExtensionApi;

describe("getSaveDetailsByNameAsync", () => {
  let dir: string;
  let counter = 0;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "bannerlord-saves-"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  // The cache outlives the tests, each one has its own save
  const writeSave = async (content: string): Promise<string> => {
    const file = path.join(dir, `save${counter++}.sav`);
    await fs.writeFile(file, content);
    mocks.getSaveFilePathAsync.mockResolvedValue(file);
    return file;
  };

  it("reads the details of the save's file", async () => {
    const file = await writeSave("save");
    mocks.readSaveDetailsInWorkerAsync.mockResolvedValue({
      clanName: "Galend",
    });

    expect(await getSaveDetailsByNameAsync(api, "Campaign")).toEqual({
      clanName: "Galend",
    });
    expect(mocks.getSaveFilePathAsync).toHaveBeenCalledWith("Campaign");
    expect(mocks.readSaveDetailsInWorkerAsync).toHaveBeenCalledWith(file);
  });

  it("reads a save once while it doesn't change", async () => {
    await writeSave("save");
    mocks.readSaveDetailsInWorkerAsync.mockResolvedValue({ clanTier: 1 });

    await getSaveDetailsByNameAsync(api, "Campaign");
    const second = await getSaveDetailsByNameAsync(api, "Campaign");

    expect(second).toEqual({ clanTier: 1 });
    expect(mocks.readSaveDetailsInWorkerAsync).toHaveBeenCalledTimes(1);
  });

  it("reads a save again once it's overwritten", async () => {
    const file = await writeSave("save");
    mocks.readSaveDetailsInWorkerAsync
      .mockResolvedValueOnce({ clanTier: 1 })
      .mockResolvedValueOnce({ clanTier: 2 });

    await getSaveDetailsByNameAsync(api, "Campaign");
    await fs.writeFile(file, "a longer save");

    expect(await getSaveDetailsByNameAsync(api, "Campaign")).toEqual({
      clanTier: 2,
    });
    expect(mocks.readSaveDetailsInWorkerAsync).toHaveBeenCalledTimes(2);
  });

  it("is empty when the save can't be read", async () => {
    await writeSave("save");
    mocks.readSaveDetailsInWorkerAsync.mockRejectedValue(new Error("broken"));

    expect(await getSaveDetailsByNameAsync(api, "Campaign")).toEqual({});
  });

  it("is empty when the save's file is gone", async () => {
    mocks.getSaveFilePathAsync.mockResolvedValue(path.join(dir, "missing.sav"));

    expect(await getSaveDetailsByNameAsync(api, "Campaign")).toEqual({});
    expect(mocks.readSaveDetailsInWorkerAsync).not.toHaveBeenCalled();
  });

  it("is empty when the save has no file", async () => {
    mocks.getSaveFilePathAsync.mockResolvedValue(undefined);

    expect(await getSaveDetailsByNameAsync(api, "Campaign")).toEqual({});
  });

  it("is empty when the launcher can't find the save", async () => {
    mocks.getSaveFilePathAsync.mockRejectedValue(new Error("no launcher"));

    expect(await getSaveDetailsByNameAsync(api, "Campaign")).toEqual({});
  });
});

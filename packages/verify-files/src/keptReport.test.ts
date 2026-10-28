import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectors, types } from "@nexusmods/vortex-api";
import { IVerifyFilesReport } from "./types";
import { verifyFilesAsync } from "./verify";
import {
  takeKeptReport,
  verifyAndKeepAsync,
  watchGameFolderWrites,
} from "./keptReport";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: { discoveryByGame: vi.fn() },
  types: {},
}));
// The real one loads the stores' native bindings
vi.mock("./verify", () => ({ verifyFilesAsync: vi.fn() }));

const GAME_PATH = "C:\\Games\\Bannerlord";

const report: IVerifyFilesReport = {
  store: "steam",
  buildId: "1",
  storeUrl: "steam://validate/261550",
  expectedFileCount: 10,
  sizesKnown: true,
  contentsChecked: false,
  missingLists: [],
  files: [],
};

describe("keptReport", () => {
  const listeners = new Map<string, () => Promise<void>>();
  const api = {
    getState: () => ({}),
    onAsync: (event: string, listener: () => Promise<void>) => {
      listeners.set(event, listener);
    },
  } as unknown as types.IExtensionApi;
  watchGameFolderWrites(api);

  beforeEach(() => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue({ path: GAME_PATH });
    vi.mocked(verifyFilesAsync).mockResolvedValue(report);
  });

  afterEach(() => {
    // Each test starts without a kept report
    takeKeptReport(undefined, undefined);
    vi.resetAllMocks();
  });

  it("keeps the report for the game's folder and store, once", async () => {
    await expect(verifyAndKeepAsync(api)).resolves.toBe(report);

    expect(takeKeptReport(GAME_PATH, "steam")).toBe(report);
    expect(takeKeptReport(GAME_PATH, "steam")).toBeUndefined();
  });

  it("drops the report of another folder or store", async () => {
    await verifyAndKeepAsync(api);
    expect(takeKeptReport("D:\\Bannerlord", "steam")).toBeUndefined();

    await verifyAndKeepAsync(api);
    expect(takeKeptReport(GAME_PATH, "gog")).toBeUndefined();
    // Taking it drops it either way
    expect(takeKeptReport(GAME_PATH, "steam")).toBeUndefined();
  });

  it.each([
    "will-deploy",
    "did-deploy",
    "will-purge",
    "did-purge",
    "deploy-single-mod",
  ])("drops the report on %s", async (event) => {
    await verifyAndKeepAsync(api);
    await listeners.get(event)!();

    expect(takeKeptReport(GAME_PATH, "steam")).toBeUndefined();
  });

  it("doesn't keep a report verified while Vortex wrote into the folder", async () => {
    vi.mocked(verifyFilesAsync).mockImplementation(async () => {
      await listeners.get("did-deploy")!();
      return report;
    });

    await expect(verifyAndKeepAsync(api)).resolves.toBe(report);
    expect(takeKeptReport(GAME_PATH, "steam")).toBeUndefined();
  });

  it("doesn't keep a report when the game's folder changed while verifying", async () => {
    vi.mocked(verifyFilesAsync).mockImplementation(() => {
      vi.mocked(selectors.discoveryByGame).mockReturnValue({
        path: "D:\\Bannerlord",
      });
      return Promise.resolve(report);
    });

    await verifyAndKeepAsync(api);
    expect(takeKeptReport("D:\\Bannerlord", "steam")).toBeUndefined();
  });

  it("doesn't keep a report without a game folder", async () => {
    vi.mocked(selectors.discoveryByGame).mockReturnValue(undefined);

    await verifyAndKeepAsync(api);
    expect(takeKeptReport(undefined, "steam")).toBeUndefined();
  });
});

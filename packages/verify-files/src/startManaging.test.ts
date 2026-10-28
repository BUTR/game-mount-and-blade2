import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, selectors, types } from "@nexusmods/vortex-api";
import { verifyAndKeepAsync } from "./keptReport";
import { showUnexpectedFilesAsync } from "./unexpectedFilesDialog";
import { getVerifyStore } from "./verify";
import { IVerifyFile, IVerifyFilesReport, VerifyFileSource } from "./types";
import { VERIFY_FILES_PAGE_ID } from "./views/options";
import * as startManaging from "./startManaging";

vi.mock("@nexusmods/vortex-api", () => ({
  log: vi.fn(),
  selectors: { activeGameId: vi.fn() },
  types: {},
}));
vi.mock("@bannerlord/core/localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({
      localize: (text: string, values: Record<string, string> = {}) =>
        Object.entries(values).reduce(
          (result, [key, value]) => result.replace(`{{${key}}}`, value),
          text,
        ),
    }),
  },
}));
vi.mock("./keptReport", () => ({ verifyAndKeepAsync: vi.fn() }));
vi.mock("./unexpectedFilesDialog", () => ({
  showUnexpectedFilesAsync: vi.fn(),
}));
// The real one loads the stores' native bindings
vi.mock("./verify", () => ({
  UNEXPECTED_SOURCES: ["unknown", "manualMod"],
  getStoreName: (store: string) => (store === "steam" ? "Steam" : store),
  getVerifyStore: vi.fn(),
}));
vi.mock("./views/options", () => ({
  VERIFY_FILES_PAGE_ID: "bannerlord-verify-files",
}));

const GAME_ID = "mountandblade2bannerlord";

type ProfilesListener = (previous: unknown, current: unknown) => void;

const file = (
  source: VerifyFileSource,
  extra: Partial<IVerifyFile> = {},
): IVerifyFile => ({
  path: "Modules/MyMod/a.dll",
  folder: "Modules/MyMod",
  status: "extra",
  source,
  ...extra,
});

const report = (files: IVerifyFile[]): IVerifyFilesReport => ({
  store: "steam",
  buildId: "1",
  storeUrl: "steam://validate/261550",
  expectedFileCount: 10,
  sizesKnown: true,
  contentsChecked: false,
  missingLists: [],
  files,
});

const profiles = (...gameIds: string[]): Record<string, unknown> =>
  Object.fromEntries(gameIds.map((gameId, index) => [`p${index}`, { gameId }]));

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("startManaging", () => {
  let onProfiles: ProfilesListener;
  let api: types.IExtensionApi;
  let emit: ReturnType<typeof vi.fn>;

  // The flag lives in the module, each test verifies or never sets it, so the next starts without it
  beforeEach(() => {
    emit = vi.fn();
    api = {
      getState: () => ({}),
      onStateChange: (_path: string[], listener: ProfilesListener) => {
        onProfiles = listener;
      },
      events: { emit },
    } as unknown as types.IExtensionApi;

    vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
    vi.mocked(getVerifyStore).mockReturnValue("steam");
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("close");
    vi.mocked(verifyAndKeepAsync).mockResolvedValue(
      report([
        file("unknown", { path: "Modules/MyMod/a.dll" }),
        file("unknown", { path: "Modules/MyMod/b.dll" }),
        file("unknown", {
          path: "bin/Win64_Shipping_Client/mono-2.0-sgen.dll",
          status: "changed",
        }),
        file("unknown", {
          path: "Modules/Dlc/a.dll",
          status: "missing",
          package: { name: "War Sails", path: "C:\\XboxGames\\Dlc\\Content" },
        }),
        file("manualMod", { path: "Modules/Manual/c.dll" }),
        file("vortex", { path: "Modules/FromVortex/d.dll" }),
      ]),
    );

    startManaging.watchStartManaging(api);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("verifies on the activation after the game's first profile was added and shows the unexpected files", async () => {
    onProfiles(profiles("skyrimse"), profiles("skyrimse", GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(verifyAndKeepAsync).toHaveBeenCalledTimes(1);
    expect(showUnexpectedFilesAsync).toHaveBeenCalledTimes(1);
    const [, shownReport, shown, content] = vi.mocked(showUnexpectedFilesAsync)
      .mock.calls[0]!;
    expect(shownReport.store).toBe("steam");
    expect(content.title).toBe("The Game Folder Has Unexpected Files");
    expect(content.text).toMatch(/^5 files don't match the Steam build/);
    expect(content.actions).toEqual([
      { id: "close", label: "Close" },
      { id: "review", label: "Review", primary: true },
    ]);
    expect(content.dismissAction).toBe("close");
    // Vortex's files aren't shown
    expect(shown.map((shownFile) => shownFile.path)).toEqual([
      "Modules/MyMod/a.dll",
      "Modules/MyMod/b.dll",
      "bin/Win64_Shipping_Client/mono-2.0-sgen.dll",
      "Modules/Dlc/a.dll",
      "Modules/Manual/c.dll",
    ]);
  });

  it("speaks of a single file in the singular", async () => {
    vi.mocked(verifyAndKeepAsync).mockResolvedValue(
      report([file("unknown", { path: "bin/package_info.txt" })]),
    );
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    const { text } = vi.mocked(showUnexpectedFilesAsync).mock.calls[0]![3];
    expect(text).toMatch(/^1 file doesn't match the Steam build/);
  });

  it("opens the Game files page from the dialog", async () => {
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("review");
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(emit).toHaveBeenCalledWith("show-main-page", VERIFY_FILES_PAGE_ID);
  });

  it("doesn't open the page when the dialog is closed", async () => {
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(showUnexpectedFilesAsync).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it("verifies only once per start of managing", async () => {
    onProfiles(undefined, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(verifyAndKeepAsync).toHaveBeenCalledTimes(1);
  });

  it("doesn't verify an activation of a game Vortex already managed", async () => {
    // Another profile of a managed game, and the game's profiles changing
    onProfiles(profiles(GAME_ID), profiles(GAME_ID, GAME_ID));
    onProfiles(profiles(GAME_ID, GAME_ID), profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(verifyAndKeepAsync).not.toHaveBeenCalled();
  });

  it("doesn't verify when another game's first profile was added", async () => {
    onProfiles({}, profiles("skyrimse"));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(verifyAndKeepAsync).not.toHaveBeenCalled();
  });

  it("verifies again when the game is managed again after it stopped being managed", async () => {
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    onProfiles(profiles(GAME_ID), {});
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(verifyAndKeepAsync).toHaveBeenCalledTimes(2);
  });

  it("doesn't verify a store without a list of the build's files", async () => {
    vi.mocked(getVerifyStore).mockReturnValue(undefined);
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(verifyAndKeepAsync).not.toHaveBeenCalled();
    expect(showUnexpectedFilesAsync).not.toHaveBeenCalled();
  });

  it("doesn't show the dialog when only the game's, the store's and Vortex's files differ", async () => {
    vi.mocked(verifyAndKeepAsync).mockResolvedValue(
      report([
        file("vortex"),
        file("vortexInternal"),
        file("store"),
        file("game"),
      ]),
    );
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(showUnexpectedFilesAsync).not.toHaveBeenCalled();
  });

  it("doesn't show the dialog when another game was activated while verifying", async () => {
    vi.mocked(selectors.activeGameId).mockReturnValue("skyrimse");
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(showUnexpectedFilesAsync).not.toHaveBeenCalled();
  });

  it("logs a failure to verify instead of rejecting", async () => {
    vi.mocked(verifyAndKeepAsync).mockRejectedValue(new Error("no manifest"));
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(log).toHaveBeenCalledWith(
      "warn",
      "Failed to verify the game files",
      expect.any(Error),
    );
    expect(showUnexpectedFilesAsync).not.toHaveBeenCalled();
  });
});

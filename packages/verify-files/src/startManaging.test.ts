import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, selectors, types } from "@nexusmods/vortex-api";
import { verifyAndKeepAsync } from "./keptReport";
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
// The real one loads the stores' native bindings
vi.mock("./verify", () => ({
  UNEXPECTED_SOURCES: ["unknown", "manualMod"],
  getStoreName: (store: string) => (store === "steam" ? "Steam" : store),
  getVerifyStore: vi.fn(),
}));
vi.mock("./views/options", () => ({
  VERIFY_FILES_PAGE_ID: "bannerlord-verify-files",
}));
// The real one renders the page's cells
vi.mock("./views/tableAttributes", () => ({
  getStatusLabel: (_t: unknown, status: string) =>
    status.charAt(0).toUpperCase() + status.slice(1),
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
  let showDialog: ReturnType<typeof vi.fn>;
  let emit: ReturnType<typeof vi.fn>;

  // The flag lives in the module, each test verifies or never sets it, so the next starts without it
  beforeEach(() => {
    showDialog = vi.fn(() => Promise.resolve({ action: "Close", input: {} }));
    emit = vi.fn();
    api = {
      getState: () => ({}),
      onStateChange: (_path: string[], listener: ProfilesListener) => {
        onProfiles = listener;
      },
      showDialog,
      events: { emit },
    } as unknown as types.IExtensionApi;

    vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
    vi.mocked(getVerifyStore).mockReturnValue("steam");
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
    expect(showDialog).toHaveBeenCalledTimes(1);
    const [type, , content] = showDialog.mock.calls[0]!;
    expect(type).toBe("info");
    // Vortex's files aren't counted
    expect(content.text).toContain("5 files");
    expect(content.text).toContain("Steam");
    // Each file with its status, a DLC's by its package
    expect(content.message).toBe(
      [
        "Extra: Modules/MyMod/a.dll",
        "Extra: Modules/MyMod/b.dll",
        "Changed: bin/Win64_Shipping_Client/mono-2.0-sgen.dll",
        "Missing: War Sails › Modules/Dlc/a.dll",
        "Extra: Modules/Manual/c.dll",
      ].join("\n"),
    );
  });

  it("counts the files past the listed ones", async () => {
    vi.mocked(verifyAndKeepAsync).mockResolvedValue(
      report(
        Array.from({ length: 32 }, (_, index) =>
          file("unknown", { path: `Modules/MyMod/${index}.dll` }),
        ),
      ),
    );
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    const lines = showDialog.mock.calls[0]![2].message.split("\n");
    expect(lines).toHaveLength(31);
    expect(lines[30]).toBe("...and 2 more");
  });

  it("opens the Game files page from the dialog", async () => {
    showDialog.mockResolvedValue({ action: "Review", input: {} });
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(emit).toHaveBeenCalledWith("show-main-page", VERIFY_FILES_PAGE_ID);
  });

  it("doesn't open the page when the dialog is closed", async () => {
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(showDialog).toHaveBeenCalledTimes(1);
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
    expect(showDialog).not.toHaveBeenCalled();
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

    expect(showDialog).not.toHaveBeenCalled();
  });

  it("doesn't show the dialog when another game was activated while verifying", async () => {
    vi.mocked(selectors.activeGameId).mockReturnValue("skyrimse");
    onProfiles({}, profiles(GAME_ID));
    startManaging.verifyIfStartedManaging(api);
    await flushAsync();

    expect(showDialog).not.toHaveBeenCalled();
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
    expect(showDialog).not.toHaveBeenCalled();
  });
});

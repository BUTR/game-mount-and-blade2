import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, selectors, types } from "@nexusmods/vortex-api";
import { archiveFilesAsync, getArchiveSpaceAsync } from "./archive";
import { IVerifyFile, IVerifyFilesReport, VerifyFileSource } from "./types";
import { showUnexpectedFilesAsync } from "./unexpectedFilesDialog";
import { getVerifyStore, verifyFilesAsync } from "./verify";
import {
  getDownloadedCollectionName,
  watchCollectionInstalls,
} from "./collectionInstall";

vi.mock("@nexusmods/vortex-api", () => ({
  log: vi.fn(),
  selectors: { discoveryByGame: vi.fn() },
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
vi.mock("./archive", () => ({
  archiveFilesAsync: vi.fn(),
  getArchiveSpaceAsync: vi.fn(),
}));
vi.mock("./unexpectedFilesDialog", () => ({
  showUnexpectedFilesAsync: vi.fn(),
}));
// The real one loads the stores' native bindings
vi.mock("./verify", () => ({
  UNEXPECTED_SOURCES: ["unknown", "manualMod"],
  getStoreName: (store: string) => (store === "steam" ? "Steam" : store),
  getVerifyStore: vi.fn(),
  isDeletable: (file: IVerifyFile) =>
    file.status === "extra" &&
    file.package === undefined &&
    ["unknown", "manualMod", "game"].includes(file.source),
  verifyFilesAsync: vi.fn(),
}));

const GAME_ID = "mountandblade2bannerlord";
const GAME_PATH = "C:\\Games\\Bannerlord";

type WillInstallMod = (gameId: string, archiveId?: string) => Promise<void>;

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
  version: "v1.2.12",
  storeUrl: "steam://validate/261550",
  expectedFileCount: 10,
  sizesKnown: true,
  contentsChecked: false,
  missingLists: [],
  files,
});

const collectionDownload = {
  modInfo: {
    name: "Bannerlord Overhaul",
    nexus: { ids: { collectionId: 1234, revisionId: 5678 } },
  },
};
const modDownload = {
  modInfo: { name: "Harmony", nexus: { ids: { modId: 2006, fileId: 1 } } },
};

describe("collectionInstall", () => {
  let willInstallMod: WillInstallMod;
  let api: types.IExtensionApi;
  let sendNotification: ReturnType<typeof vi.fn>;
  let dismissNotification: ReturnType<typeof vi.fn>;
  let showErrorNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendNotification = vi.fn(() => "notification");
    dismissNotification = vi.fn();
    showErrorNotification = vi.fn();
    const state = {
      persistent: {
        downloads: {
          files: { collection: collectionDownload, mod: modDownload },
        },
      },
    };
    api = {
      getState: () => state,
      onAsync: (event: string, listener: WillInstallMod) => {
        if (event === "will-install-mod") {
          willInstallMod = listener;
        }
      },
      sendNotification,
      dismissNotification,
      showErrorNotification,
    } as unknown as types.IExtensionApi;

    vi.mocked(selectors.discoveryByGame).mockReturnValue({ path: GAME_PATH });
    vi.mocked(getVerifyStore).mockReturnValue("steam");
    vi.mocked(verifyFilesAsync).mockResolvedValue(
      report([
        file("unknown", { path: "Modules/MyMod/a.dll" }),
        file("manualMod", { path: "Modules/Manual/b.dll" }),
        file("unknown", {
          path: "bin/Win64_Shipping_Client/mono-2.0-sgen.dll",
          status: "changed",
        }),
        file("vortex", { path: "Modules/FromVortex/c.dll" }),
      ]),
    );
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("continue");
    vi.mocked(getArchiveSpaceAsync).mockResolvedValue({
      required: 300 * 1024 * 1024,
      free: 10 * 1024 * 1024 * 1024,
      drive: "C:\\",
    });
    vi.mocked(archiveFilesAsync).mockResolvedValue({
      kept: [],
    } as unknown as Awaited<ReturnType<typeof archiveFilesAsync>>);

    watchCollectionInstalls(api);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("shows the unexpected files before a collection's download installs", async () => {
    await willInstallMod(GAME_ID, "collection");

    expect(verifyFilesAsync).toHaveBeenCalledTimes(1);
    // The installation waits while verifying, the notification is gone after
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "activity" }),
    );
    expect(dismissNotification).toHaveBeenCalledWith("notification");

    const [, , shown, content] = vi.mocked(showUnexpectedFilesAsync).mock
      .calls[0]!;
    // Vortex's files aren't shown
    expect(shown.map((shownFile) => shownFile.path)).toEqual([
      "Modules/MyMod/a.dll",
      "Modules/Manual/b.dll",
      "bin/Win64_Shipping_Client/mono-2.0-sgen.dll",
    ]);
    expect(content.text).toMatch(
      /^Bannerlord Overhaul works best with a clean game folder, but 3 files/,
    );
    // The changed file can't be archived, the text says how to restore it
    expect(content.text).toContain(
      "Verify your game files in Steam to restore them",
    );
    expect(content.actions).toEqual([
      { id: "continue", label: "Continue Without Cleaning" },
      {
        id: "archive",
        label: "Archive 2 Files and Continue",
        primary: true,
      },
    ]);
    expect(content.dismissAction).toBe("continue");
    expect(archiveFilesAsync).not.toHaveBeenCalled();
  });

  it("archives the extra files under the collection's name before the installation goes on", async () => {
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("archive");

    await willInstallMod(GAME_ID, "collection");

    expect(archiveFilesAsync).toHaveBeenCalledTimes(1);
    const [gamePath, store, buildId, archived, options] =
      vi.mocked(archiveFilesAsync).mock.calls[0]!;
    expect([gamePath, store, buildId]).toEqual([GAME_PATH, "steam", "1"]);
    expect(archived.map((archivedFile) => archivedFile.path)).toEqual([
      "Modules/MyMod/a.dll",
      "Modules/Manual/b.dll",
    ]);
    expect(options?.name).toBe("Before installing Bannerlord Overhaul");
    expect(options?.version).toBe("v1.2.12");
    expect(showErrorNotification).not.toHaveBeenCalled();
  });

  it("holds the installation until the archiving finishes", async () => {
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("archive");
    let finishArchiving = (): void => undefined;
    vi.mocked(archiveFilesAsync).mockReturnValue(
      new Promise((resolve) => {
        finishArchiving = () =>
          resolve({ kept: [] } as unknown as Awaited<
            ReturnType<typeof archiveFilesAsync>
          >);
      }),
    );

    let installGoesOn = false;
    const held = willInstallMod(GAME_ID, "collection").then(() => {
      installGoesOn = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(archiveFilesAsync).toHaveBeenCalledTimes(1);
    expect(installGoesOn).toBe(false);

    finishArchiving();
    await held;
    expect(installGoesOn).toBe(true);
  });

  it("shows the archiving's progress, and warns about files left in the game folder", async () => {
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("archive");
    vi.mocked(archiveFilesAsync).mockImplementation(
      async (_gamePath, _store, _buildId, archived, options) => {
        options?.onProgress?.(0.5);
        options?.onProgress?.(0.501);
        return { kept: [archived[0]!] } as unknown as Awaited<
          ReturnType<typeof archiveFilesAsync>
        >;
      },
    );

    await willInstallMod(GAME_ID, "collection");

    const progress = sendNotification.mock.calls.filter(
      ([notification]) => notification.progress !== undefined,
    );
    // Once per whole percent
    expect(progress).toHaveLength(1);
    expect(progress[0]![0]).toMatchObject({ id: "notification", progress: 50 });
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        message:
          "1 files changed while they were archived and were left in the game folder",
      }),
    );
  });

  it("shows a failure to archive and lets the installation go on", async () => {
    vi.mocked(showUnexpectedFilesAsync).mockResolvedValue("archive");
    vi.mocked(archiveFilesAsync).mockRejectedValue(new Error("disk full"));

    await expect(willInstallMod(GAME_ID, "collection")).resolves.toBe(
      undefined,
    );
    expect(showErrorNotification).toHaveBeenCalledWith(
      "Failed to archive the files",
      expect.any(Error),
      { allowReport: false },
    );
  });

  it("measures the space archiving the extra files needs", async () => {
    await willInstallMod(GAME_ID, "collection");

    expect(
      vi
        .mocked(getArchiveSpaceAsync)
        .mock.calls[0]![0].map((measured) => measured.path),
    ).toEqual(["Modules/MyMod/a.dll", "Modules/Manual/b.dll"]);
  });

  it("doesn't offer archiving when the archives' drive doesn't have the space", async () => {
    vi.mocked(getArchiveSpaceAsync).mockResolvedValue({
      required: 300 * 1024 * 1024,
      free: 100 * 1024 * 1024,
      drive: "C:\\",
    });

    await willInstallMod(GAME_ID, "collection");

    const content = vi.mocked(showUnexpectedFilesAsync).mock.calls[0]![3];
    expect(content.actions).toEqual([
      { id: "continue", label: "Continue", primary: true },
    ]);
    expect(content.text).toContain(
      "Archiving requires 300.0 MB of free space on C:\\ (where Vortex stores archives), but only 100.0 MB is " +
        "available.",
    );
    expect(content.text).not.toContain("Archiving moves");
  });

  it("offers archiving when the free space can't be read, archiving checks it itself", async () => {
    vi.mocked(getArchiveSpaceAsync).mockRejectedValue(new Error("EPERM"));

    await willInstallMod(GAME_ID, "collection");

    const content = vi.mocked(showUnexpectedFilesAsync).mock.calls[0]![3];
    expect(content.actions.map((action) => action.id)).toEqual([
      "continue",
      "archive",
    ]);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "Failed to read the archives' free space",
      expect.any(Error),
    );
  });

  it("only offers to go on when no file can be archived", async () => {
    vi.mocked(verifyFilesAsync).mockResolvedValue(
      report([file("unknown", { status: "missing" })]),
    );

    await willInstallMod(GAME_ID, "collection");

    const content = vi.mocked(showUnexpectedFilesAsync).mock.calls[0]![3];
    expect(content.actions).toEqual([
      { id: "continue", label: "Continue", primary: true },
    ]);
    expect(content.text).toMatch(
      /but 1 file in your game folder does not match/,
    );
    expect(content.text).not.toContain("Archiving");
    expect(getArchiveSpaceAsync).not.toHaveBeenCalled();
  });

  it("doesn't show the dialog when only the game's, the store's and Vortex's files differ", async () => {
    vi.mocked(verifyFilesAsync).mockResolvedValue(
      report([file("vortex"), file("game"), file("store")]),
    );

    await willInstallMod(GAME_ID, "collection");

    expect(showUnexpectedFilesAsync).not.toHaveBeenCalled();
  });

  it.each([
    ["another game's download", "skyrimse", "collection"],
    ["a mod's download", GAME_ID, "mod"],
    ["an unknown download", GAME_ID, "gone"],
    ["an install without a download", GAME_ID, undefined],
  ])("doesn't verify %s", async (_case, gameId, archiveId) => {
    await willInstallMod(gameId, archiveId);

    expect(verifyFilesAsync).not.toHaveBeenCalled();
  });

  it("doesn't verify a store without a list of the build's files", async () => {
    vi.mocked(getVerifyStore).mockReturnValue(undefined);

    await willInstallMod(GAME_ID, "collection");

    expect(verifyFilesAsync).not.toHaveBeenCalled();
  });

  it("logs a failure to verify instead of failing the installation", async () => {
    vi.mocked(verifyFilesAsync).mockRejectedValue(new Error("no manifest"));

    await expect(willInstallMod(GAME_ID, "collection")).resolves.toBe(
      undefined,
    );
    expect(dismissNotification).toHaveBeenCalledWith("notification");
    expect(log).toHaveBeenCalledWith(
      "warn",
      "Failed to check the game folder before a collection",
      expect.any(Error),
    );
    expect(showUnexpectedFilesAsync).not.toHaveBeenCalled();
  });

  it("recognizes a collection's download by its collection or revision", () => {
    const state = (modInfo: unknown): types.IState =>
      ({
        persistent: { downloads: { files: { id: { modInfo } } } },
      }) as unknown as types.IState;

    expect(
      getDownloadedCollectionName(
        state({ name: "A", nexus: { ids: { revisionId: 1 } } }),
        "id",
      ),
    ).toBe("A");
    expect(
      getDownloadedCollectionName(
        state({ nexus: { ids: { collectionId: 1 } } }),
        "id",
      ),
    ).toBe("");
    expect(
      getDownloadedCollectionName(
        state({ name: "B", nexus: { ids: { modId: 1 } } }),
        "id",
      ),
    ).toBeUndefined();
    expect(getDownloadedCollectionName(state(undefined), "id")).toBeUndefined();
  });
});

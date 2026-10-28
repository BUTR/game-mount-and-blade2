import { afterEach, describe, expect, it, vi } from "vitest";
import { selectors, types } from "@nexusmods/vortex-api";
import { getVerifyStore } from "../verify";
import { VERIFY_FILES_PAGE_ID, VerifyFilesPageOptions } from "./options";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  selectors: { activeGameId: vi.fn() },
}));
vi.mock("../verify", () => ({ getVerifyStore: vi.fn() }));

const GAME_ID = "mountandblade2bannerlord";

const context = (options: { store?: boolean } = {}): types.IExtensionContext =>
  ({
    api: {
      store: options.store === false ? undefined : {},
      getState: () => ({ session: "state" }),
    },
  }) as unknown as types.IExtensionContext;

describe("VerifyFilesPageOptions", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("is a per-game page between Profiles and Game settings, with nothing to pass to it", () => {
    const options = new VerifyFilesPageOptions(context());

    expect(options.id).toBe(VERIFY_FILES_PAGE_ID);
    expect(options.group).toBe("per-game");
    expect(options.priority).toBeGreaterThan(70);
    expect(options.priority).toBeLessThan(80);
    expect(options.props()).toEqual({});
  });

  it("is visible while the game is active and its store's build can be verified", () => {
    vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
    vi.mocked(getVerifyStore).mockReturnValue("steam");

    expect(new VerifyFilesPageOptions(context()).visible()).toBe(true);
    expect(getVerifyStore).toHaveBeenCalledWith({ session: "state" });
  });

  it("is hidden for another active game, or none", () => {
    vi.mocked(getVerifyStore).mockReturnValue("steam");

    vi.mocked(selectors.activeGameId).mockReturnValue("skyrimse");
    expect(new VerifyFilesPageOptions(context()).visible()).toBe(false);

    // Typed as a string, but there's no active game before one is managed
    vi.mocked(selectors.activeGameId).mockReturnValue(
      undefined as unknown as string,
    );
    expect(new VerifyFilesPageOptions(context()).visible()).toBe(false);
  });

  it("is hidden for a store whose builds can't be verified", () => {
    vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
    vi.mocked(getVerifyStore).mockReturnValue(undefined);

    expect(new VerifyFilesPageOptions(context()).visible()).toBe(false);
  });

  it("is hidden before Vortex's store is there, without reading the state", () => {
    vi.mocked(selectors.activeGameId).mockReturnValue(GAME_ID);
    vi.mocked(getVerifyStore).mockReturnValue("steam");

    expect(
      new VerifyFilesPageOptions(context({ store: false })).visible(),
    ).toBe(false);
    expect(selectors.activeGameId).not.toHaveBeenCalled();
  });
});

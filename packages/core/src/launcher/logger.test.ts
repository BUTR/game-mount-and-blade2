import { beforeEach, describe, expect, it, vi } from "vitest";
import { log, util } from "@nexusmods/vortex-api";
import { NativeLogger } from "@butr/vortexextensionnative";

vi.mock("@nexusmods/vortex-api", () => {
  class SetupError extends Error {}
  return { log: vi.fn(), util: { SetupError } };
});

vi.mock("@butr/vortexextensionnative", () => {
  const NativeLogger = vi.fn(function (
    this: { setCallbacks: () => void },
    _callback: (level: number, message: string) => void,
  ) {
    this.setCallbacks = vi.fn();
  });
  return {
    NativeLogger: Object.assign(NativeLogger, { setDefaultCallbacks: vi.fn() }),
  };
});

type LogCallback = (level: number, message: string) => void;

// The module keeps the logger it made, each test gets a fresh one
const loadLogger = async (): Promise<typeof import("./logger")> => {
  vi.resetModules();
  return await import("./logger");
};

const nativeLogCallback = (): LogCallback =>
  vi.mocked(NativeLogger).mock.calls.at(-1)![0] as unknown as LogCallback;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureNativeLogger", () => {
  it("routes the native log to Vortex's with matching levels", async () => {
    const { ensureNativeLogger } = await loadLogger();

    ensureNativeLogger();
    const callback = nativeLogCallback();
    for (const level of [0, 1, 2, 3, 4, 5, 99]) {
      callback(level, `message ${level}`);
    }

    expect(vi.mocked(log).mock.calls.map(([level]) => level)).toEqual([
      "debug",
      "debug",
      "info",
      "warn",
      "error",
      "error",
      "debug",
    ]);
  });

  it("creates the logger only once", async () => {
    const { ensureNativeLogger } = await loadLogger();

    ensureNativeLogger();
    ensureNativeLogger();

    expect(NativeLogger).toHaveBeenCalledTimes(1);
  });

  it("turns a library that can't load into a setup error, and tries again next time", async () => {
    const { ensureNativeLogger } = await loadLogger();
    vi.mocked(NativeLogger).mockImplementationOnce(function () {
      throw new Error("The specified module could not be found.");
    });

    expect(() => ensureNativeLogger()).toThrow(util.SetupError);
    expect(() => ensureNativeLogger()).not.toThrow();
    expect(NativeLogger).toHaveBeenCalledTimes(2);
  });

  it("names the native error in the setup error", async () => {
    const { ensureNativeLogger } = await loadLogger();
    vi.mocked(NativeLogger).mockImplementationOnce(function () {
      throw new Error("Access is denied.");
    });

    expect(() => ensureNativeLogger()).toThrow(/Access is denied\./);
  });
});

const ADDON_PATH = String.raw`\\?\C:\Vortex\plugins\bannerlord\launchermanager.node`;

// What node throws when Windows refuses the addon or one of its dependencies
const dlopenError = (message: string): Error =>
  Object.assign(new Error(message), { code: "ERR_DLOPEN_FAILED" });

describe("describeLoadFailure", () => {
  it.each([
    [
      "the English message",
      `An Application Control policy has blocked this file.\r\n${ADDON_PATH}`,
      "An Application Control policy has blocked this file.",
    ],
    [
      "Smart App Control's reputation message",
      `An Application Control policy has blocked this file.  Malicious binary reputation.\r\n${ADDON_PATH}`,
      "An Application Control policy has blocked this file.  Malicious binary reputation.",
    ],
    [
      "the number where Windows has no English message",
      `error: 4551${ADDON_PATH}`,
      "error: 4551",
    ],
    ["a reputation number", `error: 4580${ADDON_PATH}`, "error: 4580"],
  ])(
    "names an Application Control block from %s",
    async (_, message, reason) => {
      const { describeLoadFailure } = await loadLogger();

      const description = describeLoadFailure(dlopenError(message));

      expect(description).toMatch(
        /^Windows blocked the extension's native library/,
      );
      expect(description).toContain("Smart App Control");
      expect(description).toContain(`(${reason})`);
      expect(description).not.toContain(ADDON_PATH);
    },
  );

  it("gives the reason of another load failure without the path", async () => {
    const { describeLoadFailure } = await loadLogger();

    const description = describeLoadFailure(
      dlopenError(`The specified module could not be found.\r\n${ADDON_PATH}`),
    );

    expect(description).toMatch(
      /^The extension's native library could not be loaded: The specified module could not be found\. Reinstall/,
    );
    expect(description).not.toContain(ADDON_PATH);
  });

  it("doesn't take a neighbouring error number for a block", async () => {
    const { describeLoadFailure } = await loadLogger();

    expect(
      describeLoadFailure(dlopenError(`error: 45510${ADDON_PATH}`)),
    ).toMatch(/could not be loaded: error: 45510\./);
  });

  it("throws the block as the setup error", async () => {
    const { ensureNativeLogger } = await loadLogger();
    vi.mocked(NativeLogger).mockImplementationOnce(function () {
      throw dlopenError(`error: 4551${ADDON_PATH}`);
    });

    expect(() => ensureNativeLogger()).toThrow(
      /^Windows blocked the extension's native library/,
    );
  });
});

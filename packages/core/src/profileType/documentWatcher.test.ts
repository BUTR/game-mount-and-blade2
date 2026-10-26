import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { GAME_ID } from "../common";

vi.mock("@nexusmods/vortex-api", () => ({
  selectors: {
    activeGameId: (state: { activeGameId?: string }) => state.activeGameId,
  },
}));

type Observer = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  mutate: () => void;
};

const observers: Observer[] = [];
let frames: (() => void)[] = [];
const body = {};

const flushFrames = (): void => {
  const pending = frames;
  frames = [];
  for (const frame of pending) {
    frame();
  }
};

const createApi = (
  activeGameId: string,
): { api: types.IExtensionApi; activate: (gameId: string) => void } => {
  const state = { activeGameId };
  const listeners: (() => void)[] = [];
  const api = {
    getState: () => state,
    onStateChange: (_path: string[], listener: () => void) => {
      listeners.push(listener);
    },
  } as unknown as types.IExtensionApi;
  return {
    api,
    activate: (gameId) => {
      state.activeGameId = gameId;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

// The module keeps its observer and callbacks, each test gets a fresh one
const loadWatcher = async (): Promise<typeof import("./documentWatcher")> => {
  vi.resetModules();
  return await import("./documentWatcher");
};

beforeEach(() => {
  observers.length = 0;
  frames = [];
  vi.stubGlobal(
    "MutationObserver",
    class {
      public observe = vi.fn();
      public disconnect = vi.fn();
      public constructor(callback: () => void) {
        observers.push({
          observe: this.observe,
          disconnect: this.disconnect,
          mutate: callback,
        });
      }
    },
  );
  vi.stubGlobal("requestAnimationFrame", (frame: () => void) => {
    frames.push(frame);
    return frames.length;
  });
  vi.stubGlobal("document", { body });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchDocumentWhileActive", () => {
  it("watches the document's elements and classes while Bannerlord is active, running the callbacks once a frame", async () => {
    const { onDocumentChange, watchDocumentWhileActive } = await loadWatcher();
    const callback = vi.fn();
    onDocumentChange(callback);

    watchDocumentWhileActive(createApi(GAME_ID).api);

    expect(observers).toHaveLength(1);
    expect(observers[0]!.observe).toHaveBeenCalledWith(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    expect(callback).not.toHaveBeenCalled();
    flushFrames();
    expect(callback).toHaveBeenCalledTimes(1);

    observers[0]!.mutate();
    observers[0]!.mutate();
    expect(frames).toHaveLength(1);
    flushFrames();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("starts watching when Bannerlord becomes active, and stops with one last run when it isn't", async () => {
    const {
      onDocumentChange,
      scheduleDocumentCallbacks,
      watchDocumentWhileActive,
    } = await loadWatcher();
    const callback = vi.fn();
    onDocumentChange(callback);
    const { api, activate } = createApi("skyrimse");

    watchDocumentWhileActive(api);
    scheduleDocumentCallbacks();

    expect(observers[0]!.observe).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);

    activate(GAME_ID);
    flushFrames();
    expect(observers[0]!.observe).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    activate("skyrimse");
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
    flushFrames();
    expect(callback).toHaveBeenCalledTimes(2);

    scheduleDocumentCallbacks();
    expect(frames).toHaveLength(0);
  });

  it("runs every callback, in the order they were registered", async () => {
    const {
      onDocumentChange,
      scheduleDocumentCallbacks,
      watchDocumentWhileActive,
    } = await loadWatcher();
    const order: string[] = [];
    onDocumentChange(() => order.push("menu"));
    onDocumentChange(() => order.push("cards"));

    watchDocumentWhileActive(createApi(GAME_ID).api);
    flushFrames();
    scheduleDocumentCallbacks();
    flushFrames();

    expect(order).toEqual(["menu", "cards", "menu", "cards"]);
  });
});

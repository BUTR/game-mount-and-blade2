import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { watchMenuItems } from "./menuItems";
import { onDocumentChange, scheduleDocumentCallbacks } from "./documentWatcher";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../common";

vi.mock("@nexusmods/vortex-api", async (importOriginal) => {
  const api = await importOriginal<typeof import("@nexusmods/vortex-api")>();
  type State = {
    activeProfileId?: string;
    persistent: { profiles: Record<string, { gameId: string }> };
  };
  const activeProfile = (state: State) =>
    state.activeProfileId !== undefined
      ? state.persistent.profiles[state.activeProfileId]
      : undefined;
  Object.assign(api.selectors, {
    activeProfile,
    activeGameId: (state: State) => activeProfile(state)?.gameId,
  });
  return api;
});
vi.mock("@butr/vortexextensionnative", () => ({}));
vi.mock("./documentWatcher", () => ({
  onDocumentChange: vi.fn(),
  scheduleDocumentCallbacks: vi.fn(),
}));
vi.mock("../localization/manager", () => ({
  LocalizationManager: {
    getInstance: () => ({ localize: (template: string) => template }),
  },
}));

// The parts of Vortex's menu buttons the tagging reads and writes
type FakeButton = {
  dataset: Record<string, string>;
  title?: string;
  offsetWidth: number;
  querySelector: (selector: string) => { textContent: string } | null;
  removeAttribute: (name: string) => void;
};

const button = (label: string, offsetWidth = 200): FakeButton => {
  const element: FakeButton = {
    dataset: {},
    offsetWidth,
    querySelector: (selector) =>
      selector === "span" ? { textContent: ` ${label} ` } : null,
    removeAttribute: (name) => {
      if (name === "title") {
        delete element.title;
      }
    },
  };
  return element;
};

let buttons: FakeButton[];

const tagMenu = (options: {
  activeGame?: "bannerlord" | "skyrimse" | "none";
  gameMode?: "singleplayer" | "multiplayer";
}): void => {
  const activeGame = options.activeGame ?? "bannerlord";
  const state = {
    activeProfileId: activeGame === "none" ? undefined : "p1",
    persistent: {
      profiles: {
        p1: {
          id: "p1",
          gameId: activeGame === "bannerlord" ? GAME_ID : "skyrimse",
          features: {
            [MULTIPLAYER_PROFILE_FEATURE]: options.gameMode === "multiplayer",
          },
        },
      },
    },
  };
  const api = {
    getState: () => state,
    translate: (text: string) => `${text} (translated)`,
    onStateChange: vi.fn(),
  } as unknown as types.IExtensionApi;
  watchMenuItems(api);
  vi.mocked(onDocumentChange).mock.lastCall![0]();
  expect(api.onStateChange).toHaveBeenCalledWith(
    ["persistent", "profiles"],
    scheduleDocumentCallbacks,
  );
  expect(api.onStateChange).toHaveBeenCalledWith(
    ["settings", "profiles", "activeProfileId"],
    scheduleDocumentCallbacks,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  buttons = [];
  vi.stubGlobal("document", { querySelectorAll: () => buttons });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchMenuItems", () => {
  it("badges the Profiles item with the active profile's type and explains it", () => {
    buttons = [button("Mods"), button("Profiles (translated)")];

    tagMenu({ gameMode: "multiplayer" });

    expect(buttons[0]!.dataset).toEqual({});
    expect(buttons[0]!.title).toBeUndefined();
    expect(buttons[1]!.dataset).toEqual({
      bannerlordBadge: "MP",
      bannerlordTitle: "",
    });
    expect(buttons[1]!.title).toBe(
      "The active profile is a Multiplayer profile. Change a profile's type on the Profiles page",
    );
  });

  it("matches the item by Vortex's untranslated title as well", () => {
    buttons = [button("Profiles")];

    tagMenu({ gameMode: "singleplayer" });

    expect(buttons[0]!.dataset["bannerlordBadge"]).toBe("SP");
  });

  it("puts the badge in the icon's corner of a collapsed menu, naming the page in the tooltip", () => {
    buttons = [button("Profiles", 48)];

    tagMenu({ gameMode: "singleplayer" });

    expect(buttons[0]!.dataset).toEqual({
      bannerlordBadge: "SP",
      bannerlordCollapsed: "",
      bannerlordTitle: "",
    });
    expect(buttons[0]!.title).toMatch(
      /^Profiles\nThe active profile is a Singleplayer profile/,
    );
  });

  it("removes its badge and tooltip while another game is managed, keeping Vortex's own tooltip", () => {
    buttons = [button("Profiles"), button("Mods")];
    buttons[0]!.dataset["bannerlordBadge"] = "SP";
    buttons[0]!.dataset["bannerlordTitle"] = "";
    buttons[0]!.title = "The active profile is a Singleplayer profile";
    buttons[1]!.title = "Mods";

    tagMenu({ activeGame: "skyrimse" });

    expect(buttons[0]!.dataset).toEqual({});
    expect(buttons[0]!.title).toBeUndefined();
    expect(buttons[1]!.title).toBe("Mods");
  });

  it("does nothing while the menu isn't rendered", () => {
    buttons = [];

    expect(() => tagMenu({ activeGame: "none" })).not.toThrow();
  });
});

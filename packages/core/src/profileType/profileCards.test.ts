import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { types } from "@nexusmods/vortex-api";
import { watchProfileCards } from "./profileCards";
import { onDocumentChange, scheduleDocumentCallbacks } from "./documentWatcher";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "../common";

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

// The parts of Vortex's profile cards the tagging reads and writes
type FakeCard = {
  dataset: Record<string, string>;
  details: { dataset: Record<string, string> } | null;
  querySelectorAll: (selector: string) => { textContent: string }[];
  querySelector: (
    selector: string,
  ) => { dataset: Record<string, string> } | null;
};

const card = (featureValues: string[], withDetails = true): FakeCard => {
  const details = withDetails ? { dataset: {} } : null;
  return {
    dataset: {},
    details,
    querySelectorAll: (selector) =>
      selector === ".profile-feature-value"
        ? featureValues.map((text) => ({ textContent: ` ${text} ` }))
        : [],
    querySelector: (selector) =>
      selector === ".profile-details" ? details : null,
  };
};

const profile = (
  id: string,
  features: Record<string, unknown> = {},
  gameId = GAME_ID,
) => ({ id, gameId, features });

let cards: FakeCard[];

const tagCards = (profiles: Record<string, unknown>): void => {
  const api = {
    getState: () => ({ persistent: { profiles } }),
    onStateChange: vi.fn(),
  } as unknown as types.IExtensionApi;
  watchProfileCards(api);
  const tag = vi.mocked(onDocumentChange).mock.lastCall![0];
  tag();
  expect(api.onStateChange).toHaveBeenCalledWith(
    ["persistent", "profiles"],
    scheduleDocumentCallbacks,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  cards = [];
  vi.stubGlobal("document", { querySelectorAll: () => cards });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchProfileCards", () => {
  it("badges each card with its profile's type, found by the id among the card's values", () => {
    cards = [card(["Singleplayer profile", "sp"]), card(["mp", "yes"])];

    tagCards({
      sp: profile("sp", { [MULTIPLAYER_PROFILE_FEATURE]: false }),
      mp: profile("mp", { [MULTIPLAYER_PROFILE_FEATURE]: true }),
    });

    expect(cards.map((x) => x.dataset["bannerlordType"])).toEqual([
      "singleplayer",
      "multiplayer",
    ]);
  });

  it("leaves other games' cards and cards it can't match untagged, removing stale tags", () => {
    cards = [card(["skyrim"]), card(["unknown"])];
    cards[0]!.dataset["bannerlordType"] = "singleplayer";

    tagCards({ skyrim: profile("skyrim", {}, "skyrimse") });

    expect(cards.map((x) => x.dataset)).toEqual([{}, {}]);
  });

  it("adds the server's address to a server profile's details, and 'without mods' to the shared one", () => {
    cards = [card(["server"]), card(["noMods"]), card(["plain"])];

    tagCards({
      server: profile("server", {
        [MULTIPLAYER_PROFILE_FEATURE]: true,
        [SERVER_PROFILE_FEATURE]: "1.2.3.4:7210",
      }),
      noMods: profile("noMods", {
        [MULTIPLAYER_PROFILE_FEATURE]: true,
        [NO_MODS_PROFILE_FEATURE]: true,
      }),
      plain: profile("plain"),
    });

    expect(cards.map((x) => x.details?.dataset)).toEqual([
      { bannerlordServerLabel: "Address", bannerlordServer: "1.2.3.4:7210" },
      { bannerlordServerLabel: "Servers", bannerlordServer: "Without mods" },
      {},
    ]);
  });

  it("copes with a card without details", () => {
    cards = [card(["sp"], false)];

    expect(() =>
      tagCards({ sp: profile("sp", { [MULTIPLAYER_PROFILE_FEATURE]: false }) }),
    ).not.toThrow();
    expect(cards[0]!.dataset["bannerlordType"]).toBe("singleplayer");
  });
});

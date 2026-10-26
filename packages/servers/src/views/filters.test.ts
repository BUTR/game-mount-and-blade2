import { describe, expect, it, vi } from "vitest";
import { types as vetypes } from "@butr/vortexextensionnative";
import { ILobbyModule, ILobbyServer } from "@bannerlord/lobby";
import { IServerExtensionResult } from "@bannerlord/server-query/extension";
import { createPendingResult } from "@bannerlord/server-query/query";
import { IModuleCache } from "@bannerlord/core/types";
import { IServerRow } from "../row";
import { DEFAULT_SERVER_FILTERS, IServerFilters } from "../types";
import {
  countActiveFilters,
  filterServerRows,
  getModeChoices,
  getRequiredClientModules,
  isReadyToJoin,
  runsWithoutMods,
} from "./filters";

vi.mock("@butr/vortexextensionnative", () => ({
  types: {
    ApplicationVersionType: {
      Alpha: "Alpha",
      Beta: "Beta",
      EarlyAccess: "EarlyAccess",
      Release: "Release",
      Development: "Development",
      Invalid: "Invalid",
    },
    LoadType: {
      None: "None",
      LoadAfterThis: "LoadAfterThis",
      LoadBeforeThis: "LoadBeforeThis",
    },
  },
  BannerlordModuleManager: {},
}));

const lobby = (overrides: Partial<ILobbyServer> = {}): ILobbyServer => ({
  Id: { Guid: "guid" },
  Address: "203.0.113.7",
  Port: 7210,
  Region: "EU",
  PlayerCount: 0,
  MaxPlayerCount: 100,
  ServerName: "Server",
  GameModule: "Native",
  GameType: "Skirmish",
  Map: "mp_skirmish_map_001",
  UniqueMapId: null,
  IsOfficial: false,
  ByOfficialProvider: false,
  PasswordProtected: false,
  Permission: 0,
  CrossplayEnabled: false,
  HostName: "Host",
  LoadedModules: [],
  AllowsOptionalModules: true,
  ...overrides,
});

const row = (id: string, overrides: Partial<IServerRow> = {}): IServerRow => ({
  id,
  address: id.split(":")[0] ?? id,
  port: Number(id.split(":")[1] ?? 7210),
  manual: null,
  lobby: null,
  probe: null,
  extension: null,
  pinned: false,
  favorite: false,
  ...overrides,
});

const harmony = (category = 0): ILobbyModule => ({
  Id: "Bannerlord.Harmony",
  Name: "Harmony",
  Version: "v2.3.3.0",
  Category: category,
});

const availableExtension = (
  clientModules: { id: string; required: boolean }[],
): IServerExtensionResult => ({
  state: "available",
  info: {
    schemaVersion: 1,
    description: null,
    links: [],
    serverModules: [],
    clientModules: clientModules.map((module) => ({
      ...module,
      name: null,
      version: null,
      nexusMods: null,
      url: null,
    })),
    collection: null,
  },
  error: null,
  checkedAt: 1,
});

const installed = (modules: Record<string, [number, number, number]>) =>
  Object.fromEntries(
    Object.entries(modules).map(([id, [major, minor, revision]]) => [
      id,
      {
        id,
        version: {
          applicationVersionType: "Release" as vetypes.ApplicationVersionType,
          major,
          minor,
          revision,
          changeSet: 0,
        },
      },
    ]),
  ) as unknown as IModuleCache;

const filters = (overrides: Partial<IServerFilters> = {}): IServerFilters => ({
  ...DEFAULT_SERVER_FILTERS,
  ...overrides,
});

const rowsOf = (...rows: IServerRow[]): Record<string, IServerRow> =>
  Object.fromEntries(rows.map((x) => [x.id, x]));

const ids = (rows: Record<string, IServerRow>): string[] => Object.keys(rows);

describe("getRequiredClientModules", () => {
  it("leaves out optional modules", () => {
    expect(
      getRequiredClientModules(
        row("a:1", {
          lobby: lobby({
            LoadedModules: [harmony(2), { ...harmony(), Id: "B" }],
          }),
        }),
      ).map((x) => x.id),
    ).toEqual(["B"]);
  });

  it("uses the extension's modules only once it answered", () => {
    const pending: IServerExtensionResult = {
      ...availableExtension([{ id: "X", required: true }]),
      state: "pending",
    };

    expect(
      getRequiredClientModules(row("a:1", { extension: pending })),
    ).toEqual([]);
    expect(
      getRequiredClientModules(
        row("a:1", {
          extension: availableExtension([
            { id: "X", required: true },
            { id: "Y", required: false },
          ]),
        }),
      ).map((x) => x.id),
    ).toEqual(["X"]);
  });
});

describe("runsWithoutMods", () => {
  it("is true for a lobby server listing no required modules", () => {
    expect(runsWithoutMods(row("a:1", { lobby: lobby() }))).toBe(true);
    expect(
      runsWithoutMods(
        row("a:1", { lobby: lobby({ LoadedModules: [harmony(2)] }) }),
      ),
    ).toBe(true);
  });

  it("is false when a module is required", () => {
    expect(
      runsWithoutMods(
        row("a:1", { lobby: lobby({ LoadedModules: [harmony()] }) }),
      ),
    ).toBe(false);
  });

  it("is false when nothing says which modules it needs", () => {
    expect(runsWithoutMods(row("a:1"))).toBe(false);
    expect(
      runsWithoutMods(row("a:1", { lobby: lobby({ LoadedModules: null }) })),
    ).toBe(false);
  });

  it("trusts the extension for a server the lobby doesn't list", () => {
    expect(
      runsWithoutMods(row("a:1", { extension: availableExtension([]) })),
    ).toBe(true);
  });
});

describe("isReadyToJoin", () => {
  const server = row("a:1", { lobby: lobby({ LoadedModules: [harmony()] }) });

  it("is unknown until the installed modules are read", () => {
    expect(isReadyToJoin(server, null)).toBeNull();
  });

  it("is unknown when the server's modules are unknown", () => {
    expect(isReadyToJoin(row("a:1"), installed({}))).toBeNull();
  });

  it("needs every required module in the exact version", () => {
    expect(
      isReadyToJoin(server, installed({ "Bannerlord.Harmony": [2, 3, 3] })),
    ).toBe(true);
    expect(
      isReadyToJoin(server, installed({ "Bannerlord.Harmony": [2, 3, 2] })),
    ).toBe(false);
    expect(isReadyToJoin(server, installed({}))).toBe(false);
  });
});

describe("countActiveFilters", () => {
  it("counts each check and the modes as one", () => {
    expect(countActiveFilters(filters())).toBe(0);
    expect(
      countActiveFilters(
        filters({
          favorites: true,
          noPassword: true,
          modes: ["Captain", "Duel"],
        }),
      ),
    ).toBe(3);
  });
});

describe("filterServerRows", () => {
  it("returns the same rows without a search or filters", () => {
    const rows = rowsOf(row("a:1"));

    expect(filterServerRows(rows, filters(), "   ", null)).toBe(rows);
  });

  it("searches name, host, mode, map and address, ignoring case and padding", () => {
    const rows = rowsOf(
      row("10.0.0.1:7210", { lobby: lobby({ ServerName: "Best EU Server" }) }),
      row("10.0.0.2:7210", { lobby: lobby({ HostName: "ClanEU" }) }),
      row("10.0.0.3:7210", { lobby: lobby({ GameType: "Euro Duel" }) }),
      row("10.0.0.4:7210", { lobby: lobby({ Map: "eu_castle" }) }),
      row("eu.example.com:7210"),
      row("10.0.0.6:7210", {
        probe: {
          ...createPendingResult(),
          state: "online",
          mapList: { currentlyPlaying: "map_EU", maps: [] },
        },
      }),
      row("10.0.0.7:7210", { lobby: lobby() }),
    );

    expect(ids(filterServerRows(rows, filters(), "  eU ", null))).toEqual([
      "10.0.0.1:7210",
      "10.0.0.2:7210",
      "10.0.0.3:7210",
      "10.0.0.4:7210",
      "eu.example.com:7210",
      "10.0.0.6:7210",
    ]);
  });

  it("finds IPv6 servers by their bracketed address", () => {
    const rows = rowsOf(
      row("[2001:db8::1]:7210", { address: "2001:db8::1", port: 7210 }),
    );

    expect(
      ids(filterServerRows(rows, filters(), "[2001:db8::1]:", null)),
    ).toEqual(["[2001:db8::1]:7210"]);
  });

  it("always keeps the pinned server", () => {
    const rows = rowsOf(row("a:1", { pinned: true }), row("b:1"));

    expect(
      ids(filterServerRows(rows, filters({ favorites: true }), "zzz", null)),
    ).toEqual(["a:1"]);
  });

  it.each<[string, Partial<IServerFilters>, IServerRow[], string[]]>([
    [
      "favorites",
      { favorites: true },
      [row("a:1", { favorite: true }), row("b:1")],
      ["a:1"],
    ],
    [
      "servers with players",
      { hasPlayers: true },
      [
        row("a:1", { lobby: lobby({ PlayerCount: 1 }) }),
        row("b:1", { lobby: lobby({ PlayerCount: 0 }) }),
        row("c:1"),
      ],
      ["a:1"],
    ],
    [
      "servers with room, known only from the lobby",
      { notFull: true },
      [
        row("a:1", { lobby: lobby({ PlayerCount: 99, MaxPlayerCount: 100 }) }),
        row("b:1", { lobby: lobby({ PlayerCount: 100, MaxPlayerCount: 100 }) }),
        row("c:1"),
      ],
      ["a:1"],
    ],
    [
      "servers without a password, unknown counting as none",
      { noPassword: true },
      [
        row("a:1", { lobby: lobby({ PasswordProtected: true }) }),
        row("b:1", { lobby: lobby() }),
        row("c:1"),
      ],
      ["b:1", "c:1"],
    ],
    [
      "community servers",
      { community: true },
      [
        row("a:1", { lobby: lobby({ IsOfficial: true }) }),
        row("b:1", { lobby: lobby({ ByOfficialProvider: true }) }),
        row("c:1", { lobby: lobby() }),
        row("d:1"),
      ],
      ["c:1", "d:1"],
    ],
    [
      "servers needing no mods",
      { noModsNeeded: true },
      [
        row("a:1", { lobby: lobby({ LoadedModules: [harmony()] }) }),
        row("b:1", { lobby: lobby() }),
        row("c:1"),
      ],
      ["b:1"],
    ],
  ])("filters to %s", (_, active, rows, expected) => {
    expect(
      ids(filterServerRows(rowsOf(...rows), filters(active), "", null)),
    ).toEqual(expected);
  });

  it("keeps servers whose readiness is still unknown when filtering to ready ones", () => {
    const rows = rowsOf(
      row("ready:1", { lobby: lobby({ LoadedModules: [harmony()] }) }),
      row("not-ready:1", {
        lobby: lobby({ LoadedModules: [{ ...harmony(), Id: "Other" }] }),
      }),
      row("unknown:1"),
    );
    const mine = installed({ "Bannerlord.Harmony": [2, 3, 3] });

    expect(
      ids(filterServerRows(rows, filters({ readyWithMyMods: true }), "", mine)),
    ).toEqual(["ready:1", "unknown:1"]);
    expect(
      ids(filterServerRows(rows, filters({ readyWithMyMods: true }), "", null)),
    ).toEqual(["ready:1", "not-ready:1", "unknown:1"]);
  });

  it("combines filters, search and modes", () => {
    const rows = rowsOf(
      row("a:1", { favorite: true, lobby: lobby({ GameType: "Captain" }) }),
      row("b:1", { favorite: true, lobby: lobby({ GameType: "Duel" }) }),
      row("c:1", { favorite: false, lobby: lobby({ GameType: "Captain" }) }),
      row("d:1", {
        favorite: true,
        lobby: lobby({ GameType: "Captain", ServerName: "Other" }),
      }),
    );

    expect(
      ids(
        filterServerRows(
          rows,
          filters({ favorites: true, modes: ["Captain", "Skirmish"] }),
          "server",
          null,
        ),
      ),
    ).toEqual(["a:1"]);
  });

  it("drops servers of unknown mode when filtering by mode", () => {
    expect(
      ids(
        filterServerRows(
          rowsOf(row("a:1")),
          filters({ modes: ["Captain"] }),
          "",
          null,
        ),
      ),
    ).toEqual([]);
  });
});

describe("getModeChoices", () => {
  it("counts the servers of each mode that match everything but the mode filter", () => {
    const rows = rowsOf(
      row("a:1", { favorite: true, lobby: lobby({ GameType: "Skirmish" }) }),
      row("b:1", { favorite: true, lobby: lobby({ GameType: "Captain" }) }),
      row("c:1", { favorite: true, lobby: lobby({ GameType: "Captain" }) }),
      row("d:1", { favorite: false, lobby: lobby({ GameType: "Duel" }) }),
      row("e:1", { favorite: true, lobby: lobby({ GameType: "" }) }),
      row("f:1", { favorite: true }),
    );

    expect(
      getModeChoices(
        rows,
        filters({ favorites: true, modes: ["Skirmish"] }),
        "",
        null,
      ),
    ).toEqual([
      { mode: "Captain", count: 2 },
      { mode: "Skirmish", count: 1 },
    ]);
  });

  it("keeps selected modes no server has, so they can be deselected", () => {
    expect(
      getModeChoices(
        rowsOf(row("a:1", { lobby: lobby({ GameType: "Captain" }) })),
        filters({ modes: ["TeamDeathmatch"] }),
        "",
        null,
      ),
    ).toEqual([
      { mode: "Captain", count: 1 },
      { mode: "TeamDeathmatch", count: 0 },
    ]);
  });

  it("applies the search", () => {
    const rows = rowsOf(
      row("a:1", {
        lobby: lobby({ GameType: "Captain", ServerName: "Alpha" }),
      }),
      row("b:1", { lobby: lobby({ GameType: "Duel", ServerName: "Beta" }) }),
    );

    expect(getModeChoices(rows, filters(), "ALPHA", null)).toEqual([
      { mode: "Captain", count: 1 },
    ]);
  });
});

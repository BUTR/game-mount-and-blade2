import { describe, expect, it } from "vitest";
import { GAME_ID } from "@bannerlord/core/common";
import { actionsServers } from "./actions";
import { serversSettingsDefaults, serversSettingsReducers } from "./reducers";
import { serversSelectors } from "./selectors";
import {
  DEFAULT_SERVER_FILTERS,
  IServerEntry,
  IServerFilters,
  IServersSettings,
  IStateWithServers,
} from "./types";

type AnyAction = { type: string; payload: unknown };

const reduce = (
  state: IServersSettings,
  action: AnyAction,
): IServersSettings => {
  const handler = serversSettingsReducers[action.type];
  if (handler === undefined) {
    throw new Error(`No reducer for ${action.type}`);
  }
  return handler(state, action.payload);
};

const entry = (id: string): IServerEntry => ({
  id,
  address: id.split(":")[0] ?? id,
  port: Number(id.split(":")[1]),
  addedAt: 1,
});

const stateWith = (settings: IServersSettings | undefined): IStateWithServers =>
  ({
    settings: settings !== undefined ? { [GAME_ID]: settings } : {},
  }) as unknown as IStateWithServers;

describe("servers settings reducers", () => {
  it("handles every servers action", () => {
    expect(Object.keys(serversSettingsReducers).sort()).toEqual(
      Object.values(actionsServers)
        .map((action) => action.getType())
        .sort(),
    );
  });

  it("names each action's payload the way its reducer reads it", () => {
    expect(actionsServers.addServer(entry("a:1")).payload).toEqual(
      entry("a:1"),
    );
    expect(actionsServers.removeServer("a:1").payload).toEqual({
      serverId: "a:1",
    });
    expect(actionsServers.setServerFavorite("a:1", true).payload).toEqual({
      serverId: "a:1",
      favorite: true,
    });
    expect(
      actionsServers.setServerFilters(DEFAULT_SERVER_FILTERS).payload,
    ).toBe(DEFAULT_SERVER_FILTERS);
  });

  it("adds a server by its id without changing the previous state", () => {
    const before = serversSettingsDefaults;

    const after = reduce(before, actionsServers.addServer(entry("a:1")));

    expect(after.servers).toEqual({ "a:1": entry("a:1") });
    expect(before.servers).toEqual({});
  });

  it("adds a server to settings saved before servers existed", () => {
    const after = reduce(
      {} as IServersSettings,
      actionsServers.addServer(entry("a:1")),
    );

    expect(after.servers).toEqual({ "a:1": entry("a:1") });
  });

  it("removes only the given server", () => {
    const state = [entry("a:1"), entry("b:2")].reduce(
      (current, server) => reduce(current, actionsServers.addServer(server)),
      serversSettingsDefaults,
    );

    expect(
      Object.keys(reduce(state, actionsServers.removeServer("a:1")).servers),
    ).toEqual(["b:2"]);
  });

  it("stars and unstars servers", () => {
    const starred = reduce(
      reduce(
        serversSettingsDefaults,
        actionsServers.setServerFavorite("a:1", true),
      ),
      actionsServers.setServerFavorite("b:1", true),
    );

    expect(starred.favoriteServers).toEqual({ "a:1": true, "b:1": true });
    expect(
      reduce(starred, actionsServers.setServerFavorite("a:1", false))
        .favoriteServers,
    ).toEqual({ "b:1": true });
  });

  it("unstars a server in settings that have no favorites yet", () => {
    expect(
      reduce(
        {} as IServersSettings,
        actionsServers.setServerFavorite("a:1", false),
      ).favoriteServers,
    ).toEqual({});
  });

  it("replaces a server added again with the same id", () => {
    const before = reduce(
      serversSettingsDefaults,
      actionsServers.addServer(entry("a:1")),
    );

    const after = reduce(
      before,
      actionsServers.addServer({ ...entry("a:1"), addedAt: 2 }),
    );

    expect(after.servers["a:1"]?.addedAt).toBe(2);
    expect(Object.keys(after.servers)).toEqual(["a:1"]);
  });

  it("removing a server that isn't there changes nothing", () => {
    const state = reduce(
      serversSettingsDefaults,
      actionsServers.addServer(entry("a:1")),
    );

    expect(reduce(state, actionsServers.removeServer("b:2")).servers).toEqual(
      state.servers,
    );
  });

  it("replaces the filters", () => {
    const first: IServerFilters = {
      ...DEFAULT_SERVER_FILTERS,
      modes: ["Duel"],
    };
    const second: IServerFilters = {
      ...DEFAULT_SERVER_FILTERS,
      favorites: true,
    };

    const after = reduce(
      reduce(serversSettingsDefaults, actionsServers.setServerFilters(first)),
      actionsServers.setServerFilters(second),
    );

    expect(after.serverFilters).toEqual(second);
  });
});

describe("serversSelectors", () => {
  it("gives stable empty defaults before anything is saved", () => {
    const state = stateWith(undefined);

    expect(serversSelectors.servers(state)).toEqual({});
    expect(serversSelectors.servers(state)).toBe(
      serversSelectors.servers(stateWith(undefined)),
    );
    expect(serversSelectors.favoriteServers(state)).toBe(
      serversSelectors.favoriteServers(stateWith(undefined)),
    );
    expect(serversSelectors.serverFilters(state)).toBe(DEFAULT_SERVER_FILTERS);
  });

  it("gives the saved servers and favorites themselves", () => {
    const settings: IServersSettings = {
      servers: { "a:1": entry("a:1") },
      favoriteServers: { "a:1": true },
    };
    const state = stateWith(settings);

    expect(serversSelectors.servers(state)).toBe(settings.servers);
    expect(serversSelectors.favoriteServers(state)).toBe(
      settings.favoriteServers,
    );
  });

  it("fills in filters added since the filters were saved", () => {
    const saved = { favorites: true, modes: ["Duel"] } as IServerFilters;

    expect(
      serversSelectors.serverFilters(
        stateWith({ ...serversSettingsDefaults, serverFilters: saved }),
      ),
    ).toEqual({ ...DEFAULT_SERVER_FILTERS, favorites: true, modes: ["Duel"] });
  });

  it("returns the same filters object until the saved filters change", () => {
    const saved: IServerFilters = { ...DEFAULT_SERVER_FILTERS, notFull: true };
    const settings = { ...serversSettingsDefaults, serverFilters: saved };

    const first = serversSelectors.serverFilters(stateWith(settings));
    const again = serversSelectors.serverFilters(stateWith({ ...settings }));
    const changed = serversSelectors.serverFilters(
      stateWith({ ...settings, serverFilters: { ...saved, hasPlayers: true } }),
    );

    expect(again).toBe(first);
    expect(changed).not.toBe(first);
    expect(changed.hasPlayers).toBe(true);
  });
});

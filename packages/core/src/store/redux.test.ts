import { describe, expect, it } from "vitest";
import { createReducer, mergeReducers, updateAuto } from "./redux";
import { actionsSettings } from "../settings/actions";

describe("updateAuto", () => {
  it("creates the missing objects on the way to a value", () => {
    const state: { settings?: Record<string, Record<string, boolean>> } = {};

    const next = updateAuto(state, {
      settings: { $auto: { p1: { $auto: { sort: { $set: true } } } } },
    });

    expect(next).toEqual({ settings: { p1: { sort: true } } });
    expect(state).toEqual({});
  });

  it("keeps the other keys and doesn't change the state in place", () => {
    const state: { settings: Record<string, Record<string, boolean>> } = {
      settings: { p1: { sort: false }, p2: { sort: true } },
    };

    const next = updateAuto(state, {
      settings: { $auto: { p1: { $auto: { sort: { $set: true } } } } },
    });

    expect(next).toEqual({
      settings: { p1: { sort: true }, p2: { sort: true } },
    });
    expect(next.settings["p2"]).toBe(state.settings["p2"]);
    expect(state.settings["p1"]).toEqual({ sort: false });
  });
});

describe("mergeReducers", () => {
  type State = { log: string[] };
  const append =
    (entry: string) =>
    (state: State, payload: string): State => ({
      log: [...state.log, `${entry}:${payload}`],
    });

  it("runs every part's handler of an action in turn", () => {
    const reducers = mergeReducers<State>(
      { SHARED: append("a"), ONLY_A: append("a") },
      { SHARED: append("b") },
      { SHARED: append("c"), ONLY_C: append("c") },
    );

    expect(reducers["SHARED"]?.({ log: [] }, "x")).toEqual({
      log: ["a:x", "b:x", "c:x"],
    });
    expect(reducers["ONLY_A"]?.({ log: [] }, "y")).toEqual({ log: ["a:y"] });
    expect(Object.keys(reducers).sort()).toEqual([
      "ONLY_A",
      "ONLY_C",
      "SHARED",
    ]);
  });
});

describe("createReducer", () => {
  it("registers the handler under the action's type, so dispatching the action reaches it", () => {
    type State = { sortOnDeploy: Record<string, boolean> };
    const reducers: Record<string, (state: State, payload: unknown) => State> =
      {};

    createReducer(
      actionsSettings.setSortOnDeploy,
      (state, payload) => ({
        sortOnDeploy: {
          ...state.sortOnDeploy,
          [payload.profileId]: payload.sort,
        },
      }),
      reducers,
    );
    const action = actionsSettings.setSortOnDeploy("p1", true);

    expect(Object.keys(reducers)).toEqual([action.type]);
    expect(
      reducers[action.type]?.({ sortOnDeploy: {} }, action.payload),
    ).toEqual({ sortOnDeploy: { p1: true } });
  });
});

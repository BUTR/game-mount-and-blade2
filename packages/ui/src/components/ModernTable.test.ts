import { describe, expect, it } from "vitest";
import { createTableGrouping } from "./ModernTable";

type Collapsed = Record<string, string[]>;

/**
 * A useState stand-in: applies the updates the grouping makes to one state
 */
const stateOf = (initial: Collapsed) => {
  let state = initial;
  return {
    get: (): Collapsed => state,
    set: (update: Collapsed | ((previous: Collapsed) => Collapsed)): void => {
      state = typeof update === "function" ? update(state) : update;
    },
  };
};

describe("createTableGrouping", () => {
  it("reads the collapsed groups of its own column", () => {
    const state = stateOf({ author: ["Alice"], category: ["Maps"] });

    const grouping = createTableGrouping(
      "category",
      "None",
      state.get(),
      state.set,
    );

    expect(grouping.columnId).toBe("category");
    expect(grouping.emptyLabel).toBe("None");
    expect(grouping.collapsed).toEqual(["Maps"]);
  });

  it("has no collapsed groups for a column never grouped by", () => {
    const state = stateOf({ author: ["Alice"] });

    expect(
      createTableGrouping("category", "None", state.get(), state.set).collapsed,
    ).toEqual([]);
  });

  it("toggling collapses an expanded group and expands a collapsed one", () => {
    const state = stateOf({});
    const grouping = createTableGrouping(
      "category",
      "None",
      state.get(),
      state.set,
    );

    grouping.onToggle("Maps");
    grouping.onToggle("Troops");
    expect(state.get()).toEqual({ category: ["Maps", "Troops"] });

    grouping.onToggle("Maps");
    expect(state.get()).toEqual({ category: ["Troops"] });
  });

  it("toggling leaves the collapsed groups of other columns alone", () => {
    const state = stateOf({ author: ["Alice"] });
    const grouping = createTableGrouping(
      "category",
      "None",
      state.get(),
      state.set,
    );

    grouping.onToggle("Maps");

    expect(state.get()).toEqual({ author: ["Alice"], category: ["Maps"] });
  });

  it("toggling applies to the latest state, not the one it was created with", () => {
    const state = stateOf({});
    const grouping = createTableGrouping(
      "category",
      "None",
      state.get(),
      state.set,
    );

    state.set({ category: ["Maps"] });
    grouping.onToggle("Troops");

    expect(state.get()).toEqual({ category: ["Maps", "Troops"] });
  });
});

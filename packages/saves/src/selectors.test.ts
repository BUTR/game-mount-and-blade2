import { describe, expect, it } from "vitest";
import { GAME_ID } from "@bannerlord/core/common";
import { savesSelectors } from "./selectors";
import { IStateWithSaves } from "./types";

const state = (settings: unknown): IStateWithSaves =>
  ({ settings: { [GAME_ID]: settings } }) as unknown as IStateWithSaves;

describe("savesSelectors.saveNameForProfile", () => {
  it("is the save selected for the profile", () => {
    expect(
      savesSelectors.saveNameForProfile(
        state({ saveName: { profile1: "save1", profile2: "save2" } }),
        "profile2",
      ),
    ).toBe("save2");
  });

  it("is null for the No Save entry", () => {
    expect(
      savesSelectors.saveNameForProfile(
        state({ saveName: { profile1: "No Save" } }),
        "profile1",
      ),
    ).toBeNull();
  });

  it("is null for a profile without a save", () => {
    expect(
      savesSelectors.saveNameForProfile(
        state({ saveName: { profile1: "save1" } }),
        "profile2",
      ),
    ).toBeNull();
  });

  it("is null before any settings are stored", () => {
    expect(
      savesSelectors.saveNameForProfile(state(undefined), "profile1"),
    ).toBeNull();
    expect(savesSelectors.saveNameForProfile(state({}), "profile1")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { actionsSettings } from "@bannerlord/core/settings/actions";
import { actionsSave } from "./actions";
import { savesSettingsDefaults, savesSettingsReducers } from "./reducers";
import { ISavesSettings } from "./types";

const reduce = (
  type: string,
  state: ISavesSettings,
  payload: unknown,
): ISavesSettings => {
  const reducer = savesSettingsReducers[type];
  if (reducer === undefined) {
    throw new Error(`No reducer for ${type}`);
  }
  return reducer(state, payload) as ISavesSettings;
};

const setCurrentSave = (
  state: ISavesSettings,
  profileId: string,
  saveId: string | null,
): ISavesSettings =>
  reduce(
    actionsSave.setCurrentSave.getType(),
    state,
    actionsSave.setCurrentSave(profileId, saveId).payload,
  );

const removeProfileSettings = (
  state: ISavesSettings,
  profileId: string,
): ISavesSettings =>
  reduce(
    actionsSettings.removeProfileSettings.getType(),
    state,
    actionsSettings.removeProfileSettings(profileId).payload,
  );

describe("savesSettingsReducers", () => {
  it("selects a save for a profile", () => {
    const state = setCurrentSave(savesSettingsDefaults, "profile1", "save1");

    expect(state.saveName).toEqual({ profile1: "save1" });
  });

  it("keeps the other profiles' saves when selecting one", () => {
    const state = setCurrentSave(
      { saveName: { profile1: "save1", profile2: "save2" } },
      "profile1",
      "save3",
    );

    expect(state.saveName).toEqual({ profile1: "save3", profile2: "save2" });
  });

  it("stores no save as null", () => {
    const state = setCurrentSave(
      { saveName: { profile1: "save1" } },
      "profile1",
      null,
    );

    expect(state.saveName).toEqual({ profile1: null });
  });

  it("creates the saves of a state stored without them", () => {
    const state = setCurrentSave(
      {} as unknown as ISavesSettings,
      "profile1",
      "save1",
    );

    expect(state.saveName).toEqual({ profile1: "save1" });
  });

  it("doesn't change the state it was given", () => {
    const before = { saveName: { profile1: "save1" } };

    setCurrentSave(before, "profile1", "save2");
    removeProfileSettings(before, "profile1");

    expect(before).toEqual({ saveName: { profile1: "save1" } });
    expect(savesSettingsDefaults).toEqual({ saveName: {} });
  });

  it("forgets the save of a removed profile only", () => {
    const state = removeProfileSettings(
      { saveName: { profile1: "save1", profile2: "save2" } },
      "profile1",
    );

    expect(state.saveName).toEqual({ profile2: "save2" });
  });

  it("removes a profile from a state stored without saves", () => {
    const state = removeProfileSettings(
      {} as unknown as ISavesSettings,
      "profile1",
    );

    expect(state.saveName).toEqual({});
  });
});

import { GAME_ID } from "@bannerlord/core/common";
import { IStateWithSaves } from "./types";

const saveNameForProfile = (
  state: IStateWithSaves,
  profileId: string,
): string | null => {
  let saveId = state.settings[GAME_ID]?.saveName?.[profileId] ?? null;
  if (saveId === "No Save") {
    saveId = null;
  }
  return saveId;
};

export const savesSelectors = {
  saveNameForProfile,
};

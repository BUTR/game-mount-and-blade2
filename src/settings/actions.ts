import { createAction } from "redux-act";
import { EXTENSION_BASE_ID } from "../common";
import { GameMode } from "./types";

const setSortOnDeploy = createAction(
  `${EXTENSION_BASE_ID}_SET_SORT_ON_DEPLOY`,
  (profileId: string, sort: boolean) => ({
    profileId,
    sort,
  }),
);

const setFixCommonIssues = createAction(
  `${EXTENSION_BASE_ID}_SET_FIX_COMMON_ISSUES`,
  (profileId: string, fixCommonIssues: boolean) => ({
    profileId,
    fixCommonIssues,
  }),
);

const setBetaSorting = createAction(
  `${EXTENSION_BASE_ID}_SET_BETA_SORTING`,
  (profileId: string, betaSorting: boolean) => ({
    profileId,
    betaSorting,
  }),
);

const setModePrimaryTool = createAction(
  `${EXTENSION_BASE_ID}_SET_MODE_PRIMARY_TOOL`,
  (gameMode: GameMode, toolId: string | null) => ({
    gameMode,
    toolId,
  }),
);

const setModeHiddenTool = createAction(
  `${EXTENSION_BASE_ID}_SET_MODE_HIDDEN_TOOL`,
  (toolId: string, hidden: boolean) => ({
    toolId,
    hidden,
  }),
);

/**
 * Clears stored settings for a removed profile.
 */
const removeProfileSettings = createAction(
  `${EXTENSION_BASE_ID}_REMOVE_PROFILE_SETTINGS`,
  (profileId: string) => ({ profileId }),
);

export const actionsSettings = {
  setSortOnDeploy,
  setFixCommonIssues,
  setBetaSorting,
  setModePrimaryTool,
  setModeHiddenTool,
  removeProfileSettings,
};

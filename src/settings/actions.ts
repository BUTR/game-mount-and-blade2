import { createAction } from "redux-act";
import { EXTENSION_BASE_ID } from "../common";

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

export const actionsSettings = {
  setSortOnDeploy,
  setFixCommonIssues,
  setBetaSorting,
};

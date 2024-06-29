import { createAction } from 'redux-act';
import { EXTENSION_BASE_ID } from '../common';

export type SetSortOnDeployPayload = {
  profileId: string;
  sort: boolean;
};

export type SetUnblockFilesPayload = {
  profileId: string;
  unblockFiles: boolean;
};

export type SetFixCommonIssuesPayload = {
  profileId: string;
  fixCommonIssues: boolean;
};

export type SetBetaSortingPayload = {
  profileId: string;
  betaSorting: boolean;
};

const setSortOnDeploy = createAction<string, boolean, SetSortOnDeployPayload>(
  `${EXTENSION_BASE_ID}_SET_SORT_ON_DEPLOY`,
  (profileId: string, sort: boolean) => ({
    profileId,
    sort,
  })
);

const setFixCommonIssues = createAction<string, boolean, SetFixCommonIssuesPayload>(
  `${EXTENSION_BASE_ID}_SET_FIX_COMMON_ISSUES`,
  (profileId: string, fixCommonIssues: boolean) => ({
    profileId,
    fixCommonIssues,
  })
);

const setBetaSorting = createAction<string, boolean, SetBetaSortingPayload>(
  `${EXTENSION_BASE_ID}_SET_BETA_SORTING`,
  (profileId: string, betaSorting: boolean) => ({
    profileId,
    betaSorting,
  })
);

export const actionsSettings = {
  setSortOnDeploy,
  setFixCommonIssues,
  setBetaSorting,
};

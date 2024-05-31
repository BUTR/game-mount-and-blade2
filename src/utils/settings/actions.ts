import { createAction } from 'redux-act';
import { EXTENSION_BASE_ID } from '../../common';

export type SetSortOnDeployPayload = {
  profileId: string;
  sort: boolean;
};

export const setSortOnDeploy = createAction<string, boolean, SetSortOnDeployPayload>(
  `${EXTENSION_BASE_ID}_SET_SORT_ON_DEPLOY`,
  (profileId: string, sort: boolean) => ({
    profileId,
    sort,
  })
);

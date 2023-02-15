import { createAction } from "redux-act";
import { EXTENSION_BASE_ID } from "./common";

export const setSortOnDeploy = createAction(`${EXTENSION_BASE_ID}_SET_SORT_ON_DEPLOY`, (profileId: string, sort: boolean) => ({ profileId, sort }));

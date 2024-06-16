import { createAction } from 'redux-act';
import { EXTENSION_BASE_ID } from '../common';

export type SetCurrentSavePayload = {
  profileId: string;
  saveId: string | null;
};

export const setCurrentSave = createAction<string, string | null, SetCurrentSavePayload>(
  `${EXTENSION_BASE_ID}_SET_CURRENT_SAVE`,
  (profileId: string, saveId: string | null) => ({
    profileId,
    saveId,
  })
);

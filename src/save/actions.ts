import { createAction } from 'redux-act';
import { EXTENSION_BASE_ID } from '../common';

const setCurrentSave = createAction(
  `${EXTENSION_BASE_ID}_SET_CURRENT_SAVE`,
  (profileId: string, saveId: string | null) => ({
    profileId,
    saveId,
  })
);

export const actionsSave = {
  setCurrentSave,
};

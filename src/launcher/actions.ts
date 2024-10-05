import { createAction } from 'redux-act';
import { EXTENSION_BASE_ID } from '../common';

export type SetUseSteamBinariesOnXboxPayload = {
  useSteamBinariesOnXbox: boolean;
};

const setUseSteamBinariesOnXbox = createAction<boolean, SetUseSteamBinariesOnXboxPayload>(
  `${EXTENSION_BASE_ID}_SET_USE_STEAM_BINARIES_ON_XBOX`,
  (useSteamBinariesOnXbox: boolean) => ({
    useSteamBinariesOnXbox,
  })
);

export const actionsLauncher = {
  setUseSteamBinariesOnXbox,
};

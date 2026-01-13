import { createAction } from "redux-act";
import { EXTENSION_BASE_ID } from "../common";

const setUseSteamBinariesOnXbox = createAction(
  `${EXTENSION_BASE_ID}_SET_USE_STEAM_BINARIES_ON_XBOX`,
  (useSteamBinariesOnXbox: boolean) => ({
    useSteamBinariesOnXbox,
  }),
);

export const actionsLauncher = {
  setUseSteamBinariesOnXbox,
};

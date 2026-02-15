import { useSelector } from "react-redux";
import { selectors, types } from "vortex-api";
import { findBLSEMod } from "./utils";
import { IStateWithBannerlord } from "../types";
import { isModActive } from "../vortex";

export const useHasBLSE = (): boolean => {
  const profile = useSelector(selectors.activeProfile);
  return useSelector((state: IStateWithBannerlord) => {
    const mods = state.persistent.mods?.mountandblade2bannerlord ?? {};
    const blseMod = findBLSEMod(mods);
    return (
      blseMod !== undefined &&
      profile !== undefined &&
      isModActive(profile, blseMod)
    );
  });
};

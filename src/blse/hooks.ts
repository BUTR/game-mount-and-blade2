import { useSelector } from "react-redux";
import { selectors } from "vortex-api";
import { bselectors } from "../selectors";
import { isModActive } from "../vortex";

export const useHasBLSE = (): boolean => {
  const profile = useSelector(selectors.activeProfile);
  const currentBlseMod = useSelector(bselectors.blseMod);
  return (
    currentBlseMod !== undefined &&
    profile !== undefined &&
    isModActive(profile, currentBlseMod)
  );
};

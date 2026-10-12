import { useContext } from "react";
import { MainContext } from "@nexusmods/vortex-api";
import { LocalizationManager } from "./manager";

export const useLocalization = (): LocalizationManager => {
  const context = useContext(MainContext);

  return LocalizationManager.getInstance(context.api);
};

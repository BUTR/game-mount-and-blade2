import { useContext } from "react";
import { MainContext } from "@nexusmods/vortex-api";
import { VortexLauncherManager } from "./manager";

export const useLauncher = (): VortexLauncherManager => {
  const context = useContext(MainContext);

  return VortexLauncherManager.getInstance(context.api);
};

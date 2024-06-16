import { useContext } from 'react';
import { MainContext } from 'vortex-api';
import { VortexLauncherManager } from '.';

export const useLauncher = (): VortexLauncherManager => {
  const context = useContext(MainContext);

  return VortexLauncherManager.getInstance(context.api);
};

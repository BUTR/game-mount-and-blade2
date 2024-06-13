import { useContext } from 'react';
import { MainContext } from 'vortex-api';
import { VortexLauncherManager } from './manager';

export const useLauncher = () => {
  const context = useContext(MainContext);

  return VortexLauncherManager.getInstance(context.api);
};

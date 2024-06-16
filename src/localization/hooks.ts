import { useContext } from 'react';
import { MainContext } from 'vortex-api';
import { LocalizationManager } from '.';

export const useLocalization = (): LocalizationManager => {
  const context = useContext(MainContext);

  return LocalizationManager.getInstance(context.api);
};

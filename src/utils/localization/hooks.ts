import { useContext } from 'react';
import { MainContext } from 'vortex-api';
import { LocalizationManager } from './manager';

export const useLocalization = () => {
  const context = useContext(MainContext);

  return LocalizationManager.getInstance(context.api);
};

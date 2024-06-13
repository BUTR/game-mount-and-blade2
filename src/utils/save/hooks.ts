import { useContext } from 'react';
import { MainContext } from 'vortex-api';
import { SaveManager } from './manager';

export const useSave = () => {
  const context = useContext(MainContext);

  return SaveManager.getInstance(context.api);
};

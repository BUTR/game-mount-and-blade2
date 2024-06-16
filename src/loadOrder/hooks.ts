import { useContext } from 'react';
import { MainContext } from 'vortex-api';
import { LoadOrderManager } from '.';

export const useLoadOrder = (): LoadOrderManager => {
  const context = useContext(MainContext);

  return LoadOrderManager.getInstance(context.api);
};

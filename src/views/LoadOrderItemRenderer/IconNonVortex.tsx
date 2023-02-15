import * as React from 'react';
import { tooltip } from "vortex-api";
import { VortexViewModel } from '../../types';

export type IconNonVortexProps = {
  item: VortexViewModel,
};

export const IconNonVortex = (props: IconNonVortexProps): JSX.Element | null => {
  const { item } = props;

  return ((item.external ?? false)
    ? <tooltip.Icon name='dialog-info' tooltip={`Not managed by Vortex`} style={{ marginRight: `10` }} />
    : null);
}
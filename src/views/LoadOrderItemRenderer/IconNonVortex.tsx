import * as React from 'react';
import { tooltip, types, util } from "vortex-api";
import { types as vetypes } from '@butr/vortexextensionnative';
import { IMods } from '../../types';

export type IconNonVortexProps = {
  item: types.ILoadOrderDisplayItem,
  mods: IMods,
};

export const IconNonVortex = (props: IconNonVortexProps): JSX.Element | null => {
  const { item, mods } = props;

  const isNonVortexIcon = (subModId: string): boolean => {
    const modIds = Object.keys(mods);
    if (modIds.includes(subModId)) {
      return false;
    }

    const id = modIds.find((modId) => {
      const subModIds = util.getSafe<string[]>(mods[modId], [`attributes`, `subModIds`], []);
      return !!(subModIds.includes(subModId));
    });
    return (id === undefined);
  };

  return (isNonVortexIcon(item.id)
    ? <tooltip.Icon name='dialog-info' tooltip={`Not managed by Vortex`} style={{ marginRight: `10` }} />
    : null);
}
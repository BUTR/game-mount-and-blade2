import Bluebird from "bluebird";
import * as React from "react";
import path from "path";
import { tooltip, types, util } from "vortex-api";
import { types as vetypes } from '@butr/vortexextensionnative';
import { IMods } from "../../types";

export type ButtonOpenDirProps = {
  item: types.ILoadOrderDisplayItem,
  mods: IMods,
  modsPath: string,
  installPath: string,
};
export const ButtonOpenDir = (props: ButtonOpenDirProps): JSX.Element => {
  const { item, mods, modsPath, installPath } = props;

  const managedModKeys = Object.keys(mods);
  const itemPath = managedModKeys.includes(item.id)
    ? path.join(installPath, mods[item.id].installationPath)
    : path.join(modsPath, `Modules`, item.id);

  return (
    <tooltip.IconButton
      icon='open-ext'
      tooltip={`Open path`}
      className='btn-embed btn-dismiss'
      style={{ marginRight: `10` }}
      onClick={(): Bluebird<void | null> => util.opn(itemPath).catch(() => null)}
    />
  );
};
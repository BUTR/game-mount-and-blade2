import * as React from 'react';
import * as BS from 'react-bootstrap';
import { types } from "vortex-api";
import { ILoadOrder } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { types as vetypes } from '@butr/vortexextensionnative';
import { MODULE_LOGO } from '../../common';

export type ItemValidModuleProps = {
  item: types.ILoadOrderDisplayItem,
  order: ILoadOrder,
  onStatusChange: (evt: any, item: types.ILoadOrderDisplayItem) => void,
  issues: vetypes.ModuleIssue[],
};

export const ItemValidModule = (props: ItemValidModuleProps): JSX.Element => {
  const { item, order, onStatusChange, issues } = props;

  const isInvalid = issues.length !== 0;
  const isEnabled = !isInvalid && order[item.id].enabled;

  return (
    <BS.Checkbox
      checked={isEnabled}
      disabled={isInvalid}
      onChange={evt => onStatusChange(evt, item)}
    >
      <img
        src={MODULE_LOGO}
        className='submodule-logo'
        style={{
        width: `1.5em`,
        height: `1.5em`,
        marginRight: `5px`,
        }}
      />
      <span style={isInvalid ? { color: `red`, textDecoration: `line-through` } : {} }>{item.name}</span>
    </BS.Checkbox>
  );
};
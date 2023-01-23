import * as React from 'react';
import * as BS from 'react-bootstrap';
import { types } from "vortex-api";
import { ILoadOrder } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { types as vetypes } from '@butr/vortexextensionnative';
import { TW_LOGO } from '../../common';

export type ItemOfficialModuleProps = {
  item: types.ILoadOrderDisplayItem,
  order: ILoadOrder,
  onStatusChange: (evt: React.FormEvent<BS.Checkbox>, item: types.ILoadOrderDisplayItem) => void,
  issues: vetypes.ModuleIssue[],
};

export const ItemOfficialModule = (props: ItemOfficialModuleProps): JSX.Element => {
  const { item, order, onStatusChange, issues } = props;

  const index = Array.isArray(order) ? order.indexOf(item.id) : -1;
  const isInvalid = issues.length !== 0;
  const isEnabled = !isInvalid && index !== -1;

  return (
    <div style={{ display: `flex`, alignItems: `center` }}>
      <BS.Checkbox
        checked={isEnabled}
        disabled={isInvalid}
        onChange={evt => onStatusChange(evt, item)}
        >
        <img
            src={TW_LOGO}
            className='official-submodule-logo'
            style={{
            width: `1.5em`,
            height: `1.5em`,
            marginRight: `5px`,
            }}
        />
        <span style={isInvalid ? { color: `red`, textDecoration: `line-through` } : {} }>{item.name}</span>
      </BS.Checkbox>
    </div>
  );
};
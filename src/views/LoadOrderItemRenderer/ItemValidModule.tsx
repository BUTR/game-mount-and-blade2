import * as React from 'react';
import * as BS from 'react-bootstrap';
import { MODULE_LOGO } from '../../common';
import { versionToString } from '../../utils/util';
import { VortexViewModel } from '../../types';

export type ItemValidModuleProps = {
  item: VortexViewModel,
  onStatusChange: (evt: any) => void,
};

export const ItemValidModule = (props: ItemValidModuleProps): JSX.Element => {
  const { item, onStatusChange } = props;

  const isInvalid = !item.isValid;
  const isEnabled = !isInvalid && item.isSelected;
  const text = `${item.name} (${versionToString(item.moduleInfo.version)})`;

  return (
    <BS.Checkbox
      checked={isEnabled}
      disabled={isInvalid}
      onChange={onStatusChange}
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
      <span style={isInvalid ? { color: `red`, textDecoration: `line-through` } : {} }>{text}</span>
    </BS.Checkbox>
  );
};
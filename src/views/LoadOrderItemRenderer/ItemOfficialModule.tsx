import * as React from 'react';
import * as BS from 'react-bootstrap';
import { TW_LOGO } from '../../common';
import { versionToString } from '../../utils/util';
import { VortexViewModel } from '../../types';

export type ItemOfficialModuleProps = {
  item: VortexViewModel,
  onStatusChange: (evt: React.FormEvent<BS.Checkbox>) => void,
};

export const ItemOfficialModule = (props: ItemOfficialModuleProps): JSX.Element => {
  const { item, onStatusChange } = props;

  const isInvalid = !item.isValid;
  const isEnabled = !isInvalid && item.index !== -1 && item.isSelected;
  const text = `${item.name} (${versionToString(item.moduleInfo.version)})`

  return (
    <div style={{ display: `flex`, alignItems: `center` }}>
      <BS.Checkbox
        checked={isEnabled}
        disabled={isInvalid}
        onChange={onStatusChange}
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
        <span style={isInvalid ? { color: `red`, textDecoration: `line-through` } : {} }>{text}</span>
      </BS.Checkbox>
    </div>
  );
};
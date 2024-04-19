/* eslint-disable */
import * as React from 'react';
import { Checkbox, ListGroupItem } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { actions, Icon, selectors, tooltip, types, util } from 'vortex-api';

interface IBaseProps {
  api: types.IExtensionApi;
  className?: string;
  item: types.IFBLOItemRendererProps;
}

interface IConnectedProps {
  loadOrder: types.FBLOLoadOrder;
  profile: types.IProfile;
  modState: any;
}

export function BannerlordItemRenderer(props: IBaseProps): JSX.Element {
  const { api, className, item } = props;
  const { loadOrder, profile } = useSelector(mapStateToProps);
  const key = item.loEntry.name ? `${item.loEntry.name}` : `${item.loEntry.id}`;

  const position = loadOrder.findIndex((entry: types.IFBLOLoadOrderEntry) => entry.id === item.loEntry.id) + 1;

  let classes = ['load-order-entry'];
  if (className !== undefined) {
    classes = classes.concat(className.split(' '));
  }

  if (isExternal(item.loEntry)) {
    classes = classes.concat('external');
  }

  const onStatusChange = React.useCallback(
    (evt: any) => {
      const entry = {
        ...item.loEntry,
        enabled: evt.target.checked,
      };
      api.store?.dispatch(actions.setFBLoadOrderEntry(profile.id, entry));
    },
    [api, item, profile]
  );

  const checkBox = () =>
    item.displayCheckboxes ? (
      <Checkbox
        className="entry-checkbox"
        checked={item.loEntry.enabled}
        disabled={isLocked(item.loEntry)}
        onChange={onStatusChange}
      />
    ) : null;

  const lock = () => (isLocked(item.loEntry) ? <Icon className="locked-entry-logo" name="locked" /> : null);

  return (
    <ListGroupItem key={key} className={classes.join(' ')} ref={props.item.setRef}>
      <Icon className="drag-handle-icon" name="drag-handle" />
      <p className="load-order-index">{position}</p>
      {renderValidationError(props)}
      <p className="load-order-name">{key}</p>
      {renderExternalBanner(item.loEntry)}
      {checkBox()}
      {lock()}
    </ListGroupItem>
  );
}

function renderValidationError(props: IBaseProps): JSX.Element | null {
  const { invalidEntries, loEntry } = props.item;
  const invalidEntry =
    invalidEntries !== undefined
      ? invalidEntries.find((inv) => inv.id.toLowerCase() === loEntry.id.toLowerCase())
      : undefined;
  return invalidEntry !== undefined ? (
    <tooltip.Icon className="fblo-invalid-entry" name="feedback-error" tooltip={invalidEntry.reason} />
  ) : null;
}

function renderExternalBanner(item: types.IFBLOLoadOrderEntry): JSX.Element | null {
  const [t] = useTranslation(['common']);
  return isExternal(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">{t('Not managed by Vortex')}</span>
    </div>
  ) : null;
}

function isLocked(item: types.IFBLOLoadOrderEntry): boolean {
  return [true, 'true', 'always'].includes(item.locked as types.FBLOLockState);
}

function isExternal(item: types.IFBLOLoadOrderEntry): boolean {
  return item.modId !== undefined ? false : true;
}

const empty = {};
function mapStateToProps(state: types.IState): IConnectedProps {
  const profile: types.IProfile = selectors.activeProfile(state);
  return {
    profile,
    loadOrder: util.getSafe(state, ['persistent', 'loadOrder', profile.id], []),
    modState: util.getSafe(profile, ['modState'], empty),
  };
}


import React, { BaseSyntheticEvent, useCallback } from 'react';
import { Checkbox, ListGroupItem } from 'react-bootstrap';
import { useSelector, useStore } from 'react-redux';
import { Icon, selectors, types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { IModuleCompatibilityInfo, IVortexViewModelData, VortexLoadOrderStorage } from '../../../types';
import { actionsLoadOrder, hasPersistentLoadOrder, versionToString } from '../../../utils';
import { CompatibilityInfo, ModuleIcon } from '../../Shared';
import { isExternal, isLocked } from '../utils';
import { ExternalBanner, ModuleDuplicates, ModuleProviderIcon, ValidationError } from '.';

interface IFromState {
  profile: types.IProfile | undefined;
  loadOrder: VortexLoadOrderStorage;
}

export type LoadOrderItemRendererProps = {
  className?: string;
  item: Omit<types.IFBLOItemRendererProps, 'loEntry'> & { loEntry: types.IFBLOLoadOrderEntry<IVortexViewModelData> };
  availableProviders: vetypes.ModuleProviderType[];
  compatibilityInfo: IModuleCompatibilityInfo | undefined;
};

export const LoadOrderItemRenderer = (props: LoadOrderItemRendererProps): JSX.Element => {
  const { className, item, availableProviders, compatibilityInfo } = props;
  const { loadOrder, profile } = useSelector(mapState);

  const key = item.loEntry.id;
  const name = item.loEntry.name ? `${item.loEntry.name}` : `${item.loEntry.id}`;
  const version = item.loEntry.data?.moduleInfoExtended.version
    ? versionToString(item.loEntry.data.moduleInfoExtended.version)
    : 'ERROR';

  const position =
    loadOrder.findIndex((entry: types.IFBLOLoadOrderEntry<IVortexViewModelData>) => entry.id === item.loEntry.id) + 1;

  let classes = ['load-order-entry'];
  if (className !== undefined) {
    classes = classes.concat(className.split(' '));
  }

  if (isExternal(item.loEntry)) {
    classes = classes.concat('external');
  }

  const store = useStore();

  const onStatusChange = useCallback(
    (evt: BaseSyntheticEvent<Event, HTMLInputElement & Checkbox, HTMLInputElement>) => {
      const entry = {
        ...item.loEntry,
        enabled: evt.target.checked,
      };
      if (profile) {
        store.dispatch(actionsLoadOrder.setFBLoadOrderEntry(profile.id, entry));
      }
    },
    [store, item, profile]
  );

  const CheckBox = (): JSX.Element | null =>
    item.displayCheckboxes ? (
      <Checkbox
        className="entry-checkbox"
        checked={item.loEntry.enabled}
        disabled={isLocked(item.loEntry)}
        onChange={onStatusChange}
      />
    ) : null;

  const Lock = (): JSX.Element | null =>
    isLocked(item.loEntry) ? <Icon className="locked-entry-logo" name="locked" /> : null;

  return (
    <ListGroupItem key={key} className={classes.join(' ')} ref={props.item.setRef}>
      <Icon className="drag-handle-icon" name="drag-handle" />
      <p className="load-order-index">{position}</p>
      <ValidationError invalidEntries={item.invalidEntries} item={item.loEntry} />
      <ModuleIcon data={item.loEntry.data} />
      <p className="load-order-name">
        {name} ({version})
      </p>
      <ExternalBanner item={item.loEntry} />
      <CompatibilityInfo data={item.loEntry.data} compatibilityInfo={compatibilityInfo} />
      <ModuleDuplicates availableProviders={availableProviders} data={item.loEntry.data} />
      <ModuleProviderIcon data={item.loEntry.data} />
      <CheckBox />
      <Lock />
    </ListGroupItem>
  );
  // We can render a folder icon via `icon-browse`
};

const mapState = (state: types.IState): IFromState => {
  const profile: types.IProfile | undefined = selectors.activeProfile(state);
  const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile?.id] ?? [] : [];
  return {
    profile,
    loadOrder,
  };
};

import React, { BaseSyntheticEvent, useCallback, useContext, useMemo } from 'react';
import { Checkbox, ListGroupItem } from 'react-bootstrap';
import { useSelector, useStore } from 'react-redux';
import { Icon, LoadOrderIndexInput, MainContext, selectors, types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { ValidationError } from './ValidationError';
import { ExternalBanner } from './ExternalBanner';
import { ModuleDuplicates } from './ModuleDuplicates';
import { ModuleProviderIcon } from './ModuleProviderIcon';
import { SteamBinariesOnXbox } from './SteamBinariesOnXbox';
import { VortexLoadOrderStorage } from '../../../types';
import { CompatibilityInfo, ModuleIcon } from '../../Shared';
import { isExternal, isLocked } from '../utils';
import { IModuleCompatibilityInfo } from '../../../butr';
import { versionToString } from '../../../launcher';
import { actionsLoadOrder, IFBLOItemRendererProps } from '../../../loadOrder';
import { hasPersistentLoadOrder } from '../../../vortex';

interface IFromState {
  profile: types.IProfile | undefined;
  loadOrder: VortexLoadOrderStorage;
}

export type LoadOrderItemRendererProps = {
  className?: string;
  item: IFBLOItemRendererProps;
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
  const position = loadOrder.findIndex((loEntry) => loEntry.id === item.loEntry.id) + 1;

  let classes = ['load-order-entry'];
  if (className !== undefined) {
    classes = classes.concat(className.split(' '));
  }

  if (isExternal(item.loEntry)) {
    classes = classes.concat('external');
  }

  const context = useContext(MainContext);
  const store = useStore();

  const onStatusChange = useCallback(
    (evt: BaseSyntheticEvent<Event, HTMLInputElement & Checkbox, HTMLInputElement>) => {
      if (!profile) {
        return;
      }

      const loEntry = {
        ...item.loEntry,
        enabled: evt.target.checked,
      };
      store.dispatch(actionsLoadOrder.setFBLoadOrderEntry(profile.id, loEntry));
    },
    [store, item, profile]
  );

  const lockedEntriesCount = useMemo(() => (loadOrder ?? []).filter((entry) => isLocked(entry)).length, [loadOrder]);

  const onApplyIndex = useCallback(
    (idx: number) => {
      if (!profile) {
        return;
      }

      const currentIdx = position;
      if (currentIdx === idx) {
        return;
      }

      const newLO = loadOrder.filter((entry) => entry.id !== item.loEntry.id);
      newLO.splice(idx - 1, 0, item.loEntry);
      store.dispatch(actionsLoadOrder.setFBLoadOrder(profile.id, newLO));
    },
    [store, item, profile, loadOrder, position]
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
      <LoadOrderIndexInput
        className="load-order-index"
        api={context.api}
        currentPosition={position}
        item={item.loEntry}
        isLocked={isLocked}
        loadOrder={loadOrder}
        lockedEntriesCount={lockedEntriesCount}
        onApplyIndex={onApplyIndex}
      />
      <ValidationError invalidEntries={item.invalidEntries} item={item.loEntry} />
      <ModuleIcon data={item.loEntry.data} />
      <p className="load-order-name">
        {name} ({version})
      </p>
      <ExternalBanner item={item.loEntry} />
      <SteamBinariesOnXbox hasSteamBinariesOnXbox={item.loEntry.data?.hasSteamBinariesOnXbox ?? false} />
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

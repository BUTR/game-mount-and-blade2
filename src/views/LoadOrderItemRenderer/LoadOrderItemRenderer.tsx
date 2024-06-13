import React, { BaseSyntheticEvent, useCallback } from 'react';
import { Checkbox, ListGroupItem } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { Icon, selectors, tooltip, types } from 'vortex-api';
import { types as vetypes } from '@butr/vortexextensionnative';
import { IModuleCompatibilityInfo, IVortexViewModelData } from '../../types';
import { actionsLoadOrder, hasPersistentLoadOrder, useLocalization, versionToString } from '../../utils';
import { CompatibilityInfo, ModuleIcon, TooltipImage } from '../Controls';
import { STEAM_LOGO } from '../../common';

interface IProps {
  api: types.IExtensionApi;
  className?: string;
  item: types.IFBLOItemRendererProps;
  availableProviders: vetypes.ModuleProviderType[];
  compatibilityInfo: IModuleCompatibilityInfo | undefined;
}

export type LoadOrderItemRendererProps = IProps;

export const LoadOrderItemRenderer = (props: IProps) => {
  const { api, className, item, availableProviders, compatibilityInfo } = props;
  const { loadOrder, profile } = useSelector(mapState);

  const key = item.loEntry.id;
  const name = item.loEntry.name ? `${item.loEntry.name}` : `${item.loEntry.id}`;
  const version = versionToString(item.loEntry.data?.moduleInfoExtended.version);

  const position =
    loadOrder.findIndex((entry: types.IFBLOLoadOrderEntry<IVortexViewModelData>) => entry.id === item.loEntry.id) + 1;

  let classes = ['load-order-entry'];
  if (className !== undefined) {
    classes = classes.concat(className.split(' '));
  }

  if (isExternal(item.loEntry)) {
    classes = classes.concat('external');
  }

  const onStatusChange = useCallback(
    (evt: BaseSyntheticEvent<Event, HTMLInputElement & Checkbox, HTMLInputElement>) => {
      const entry = {
        ...item.loEntry,
        enabled: evt.target.checked,
      };
      api.store?.dispatch(actionsLoadOrder.setFBLoadOrderEntry(profile.id, entry));
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
      <ValidationError invalidEntries={item.invalidEntries} item={item.loEntry} />
      <ModuleIcon data={item.loEntry.data} />
      <p className="load-order-name">
        {name} ({version})
      </p>
      <ExternalBanner item={item.loEntry} />
      <CompatibilityInfo data={item.loEntry.data} compatibilityInfo={compatibilityInfo} />
      <ModuleDuplicates availableProviders={availableProviders} data={item.loEntry.data} />
      <ModuleProviderIcon data={item.loEntry.data} />
      {checkBox()}
      {lock()}
    </ListGroupItem>
  );
  // We can render a folder icon via `icon-browse`
};

const mapState = (state: types.IState) => {
  const profile = selectors.activeProfile(state);
  const loadOrder = hasPersistentLoadOrder(state.persistent) ? state.persistent.loadOrder[profile?.id] ?? [] : [];
  return {
    profile,
    loadOrder,
  };
};

const isLocked = (item: types.IFBLOLoadOrderEntry<IVortexViewModelData>): boolean => {
  return [true, 'true', 'always'].includes(item.locked as types.FBLOLockState);
};

const isExternal = (item: types.IFBLOLoadOrderEntry<IVortexViewModelData>): boolean => {
  return item.modId !== undefined ? false : true;
};

const isSteamWorksop = (data: IVortexViewModelData | undefined): boolean => {
  return data?.moduleInfoExtended.moduleProviderType === 'Steam';
};

const ValidationError = (props: {
  invalidEntries: types.IFBLOInvalidResult[] | undefined;
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
}) => {
  const { invalidEntries, item } = props;
  const invalidEntryList =
    invalidEntries !== undefined
      ? invalidEntries
          .filter((inv) => inv.id.toLowerCase() === item.id.toLowerCase())
          .map((x) => x.reason)
          .join('\n')
      : undefined;
  return invalidEntryList !== undefined && invalidEntryList !== '' ? (
    <tooltip.Icon
      className="fblo-invalid-entry"
      name="feedback-error"
      style={{ width: `1.5em`, height: `1.5em` }}
      tooltip={invalidEntryList}
    />
  ) : null;
};

const ExternalBanner = (props: { item: types.IFBLOLoadOrderEntry<IVortexViewModelData> }) => {
  const { item } = props;

  const { localize: t } = useLocalization();

  return isExternal(item) ? (
    <div className="load-order-unmanaged-banner">
      <Icon className="external-caution-logo" name="feedback-warning" />
      <span className="external-text-area">{t('Not managed by Vortex')}</span>
    </div>
  ) : null;
};

const ModuleProviderIcon = (props: { data: IVortexViewModelData | undefined }) => {
  const { data } = props;

  const { localize: t } = useLocalization();

  if (isSteamWorksop(data)) {
    return (
      <TooltipImage src={STEAM_LOGO} style={{ width: `1.5em`, height: `1.5em` }} tooltip={t('Managed by Steam')} />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};

const ModuleDuplicates = (props: { availableProviders: vetypes.ModuleProviderType[]; data?: IVortexViewModelData }) => {
  const { availableProviders, data } = props;

  const { localize: t } = useLocalization();

  if (availableProviders.length <= 1) {
    return <div style={{ width: `1.5em`, height: `1.5em` }} />;
  }

  if (data?.moduleInfoExtended.moduleProviderType) {
    //const redundantProviders = availableProviders.filter(
    //  (provider) => provider !== item.data?.moduleInfoExtended.moduleProviderType
    //);
    // tooltip={t(`The mod is also installed via ${redundantProviders.join(', ')}!`)}
    return (
      <tooltip.Icon
        className="nexus-id-invalid"
        name="feedback-warning"
        style={{ width: `1.5em`, height: `1.5em` }}
        tooltip={t(
          `{=kfMQEOFS}The Module is installed in the game's /Modules folder and on Steam Workshop!{NL}` +
            `The /Modules version will be used!`
        )}
      />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};

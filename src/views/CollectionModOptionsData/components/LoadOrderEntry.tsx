import React from 'react';
import { ListGroupItem } from 'react-bootstrap';
import { IPersistenceLoadOrderEntry, VortexLoadOrderStorage } from '../../../types';
import { CompatibilityInfo, isOptional, ModuleIcon, OptionalBanner } from '../../Shared';
import { IModuleCompatibilityInfoCache } from '../../../butr';
import { versionToString } from '../../../launcher';

export type LoadOrderEntryProps = {
  entry: IPersistenceLoadOrderEntry | undefined;
  loadOrder: VortexLoadOrderStorage;
  compatibilityInfoCache: IModuleCompatibilityInfoCache;
};

export const LoadOrderEntry = (props: LoadOrderEntryProps): JSX.Element | null => {
  const { entry, loadOrder, compatibilityInfoCache } = props;

  if (!entry) {
    return null;
  }

  const loIdx = loadOrder.findIndex((x) => x.id === entry.id);
  if (loIdx === -1) {
    return null;
  }

  const loEntry = loadOrder[loIdx];
  if (!loEntry || !loEntry.data) {
    return null;
  }

  const compatibilityInfo = compatibilityInfoCache[loEntry.id];

  const key = loEntry.id;
  const name = entry.name ? `${entry.name}` : `${entry.id}`;
  const version = versionToString(loEntry.data.moduleInfoExtended.version);
  let classes = ['load-order-entry', 'collection-tab'];
  if (isOptional(loEntry)) {
    classes = classes.concat('external');
  }

  return (
    <ListGroupItem key={key} className={classes.join(' ')}>
      <p className="load-order-index">{loIdx + 1}</p>
      <ModuleIcon data={loEntry.data} />
      <p className="load-order-name">
        {name} ({version})
      </p>
      <OptionalBanner item={loEntry} />
      <CompatibilityInfo data={loEntry.data} compatibilityInfo={compatibilityInfo} />
      <div style={{ width: `1.5em`, height: `1.5em` }} />
    </ListGroupItem>
  );
};

import React from 'react';
import { ListGroup } from 'react-bootstrap';
import { ModOptionsEntryView } from './ModOptionsEntryView';
import { ModOptionsEntry, ModOptionsStorage } from '../../../modoptions';
import { useLocalization } from '../../../localization';

export type GlobalSettingsProps = {
  settings: ModOptionsStorage;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};

export const GlobalSettings = (props: GlobalSettingsProps): JSX.Element => {
  const { settings, isToggled, toggleEntry } = props;

  const { localize: t } = useLocalization();

  return (
    <div>
      <h5>{t('Global Options')}</h5>
      <ListGroup id="collections-load-order-list">
        {Object.values(settings).map((entry) => (
          <ModOptionsEntryView key={entry.name} entry={entry} isToggled={isToggled} toggleEntry={toggleEntry} />
        ))}
      </ListGroup>
    </div>
  );
};

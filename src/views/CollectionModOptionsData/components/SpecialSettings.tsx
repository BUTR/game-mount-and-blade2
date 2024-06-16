import React from 'react';
import { ListGroup } from 'react-bootstrap';
import { ModOptionsEntry, ModOptionsStorage, useLocalization } from '../../../utils';
import { ModOptionsEntryView } from '.';

export type SpecialSettingsProps = {
  settings: ModOptionsStorage;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};

export const SpecialSettings = (props: SpecialSettingsProps): JSX.Element => {
  const { settings, isToggled, toggleEntry } = props;

  const { localize: t } = useLocalization();

  return (
    <div>
      <h5>{t('Special Options')}</h5>
      <ListGroup id="collections-load-order-list">
        {Object.values(settings).map((entry) => (
          <ModOptionsEntryView key={entry.name} entry={entry} isToggled={isToggled} toggleEntry={toggleEntry} />
        ))}
      </ListGroup>
    </div>
  );
};

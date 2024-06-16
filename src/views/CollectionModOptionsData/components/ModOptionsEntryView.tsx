import React, { BaseSyntheticEvent } from 'react';
import { Checkbox, ListGroupItem } from 'react-bootstrap';
import { ModOptionsEntry } from '../../../utils';

export type ModOptionsEntryViewProps = {
  entry: ModOptionsEntry | undefined;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};

export const ModOptionsEntryView = (props: ModOptionsEntryViewProps): JSX.Element | null => {
  const { entry, isToggled, toggleEntry } = props;

  if (!entry) {
    return null;
  }

  const key = entry.name;
  const name = entry.name;
  const classes = ['load-order-entry', 'collection-tab'];

  const checked = isToggled(entry);

  return (
    <ListGroupItem key={key} className={classes.join(' ')}>
      <p className="load-order-name">{name}</p>
      <Checkbox
        className="entry-checkbox"
        checked={checked}
        onChange={(evt: BaseSyntheticEvent<Event, HTMLInputElement & Checkbox, HTMLInputElement>) => {
          toggleEntry(evt.target.checked, entry);
        }}
      />
      <div style={{ width: `1.5em`, height: `1.5em` }} />
    </ListGroupItem>
  );
};

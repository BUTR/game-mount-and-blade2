import React, { BaseSyntheticEvent, useEffect, useState } from 'react';
import { Checkbox, ListGroup, ListGroupItem } from 'react-bootstrap';
import { EmptyPlaceholder, types } from 'vortex-api';
import { useSelector } from 'react-redux';
import {
  hasStatePersistentCollectionModWithIncludedModOptions,
  ICollectionFeatureProps,
  IncludedModOptions,
  nameof,
  useLocalization,
} from '../../utils';
import { GAME_ID } from '../../common';
import {
  getGlobalSettings,
  getSpecialSettings,
  ModOptionsEntry,
  ModOptionsStorage,
  PersistentModOptionsEntry,
  readSettingsContent,
} from '../../utils/modoptions';

interface IProps extends ICollectionFeatureProps {}

export type BannerlordModOptionsDataViewProps = ICollectionFeatureProps;

export const BannerlordModOptionsDataView = (props: IProps) => {
  const { collection, onSetCollectionAttribute } = props;

  const { localize: t } = useLocalization();

  const [specialSettings, setSpecialSettings] = useState<ModOptionsStorage>({});
  const [globalSettings, setGlobalSettings] = useState<ModOptionsStorage>({});

  const includedModOptions = useSelector<types.IState, PersistentModOptionsEntry[]>((state) => {
    if (!hasStatePersistentCollectionModWithIncludedModOptions(state.persistent, collection.id)) {
      return [];
    }

    const collectionMod = state.persistent.mods[GAME_ID]?.[collection.id];
    return collectionMod?.attributes?.collection?.includedModOptions ?? [];
  });

  const toggleEntry = React.useCallback(
    (newValue: boolean, entry: ModOptionsEntry) => {
      const newEntries: PersistentModOptionsEntry[] = newValue
        ? [...includedModOptions, { ...entry, contentBase64: readSettingsContent(entry) }]
        : includedModOptions.filter((x) => x.name !== entry.name);
      onSetCollectionAttribute([nameof<IncludedModOptions>('includedModOptions')], newEntries);
    },
    [includedModOptions, onSetCollectionAttribute]
  );

  const isToggled = (entry: ModOptionsEntry) => {
    return includedModOptions.some((x) => x.name === entry.name);
  };

  useEffect(() => {
    async function setSettings() {
      setSpecialSettings(await getSpecialSettings());
      setGlobalSettings(await getGlobalSettings());
    }

    setSettings();
  }, []);

  return globalSettings && Object.values(globalSettings).length !== 0 ? (
    <div style={{ overflow: 'auto' }}>
      <h4>{t('Mod Configuration Options')}</h4>
      <p>{t('This is a snapshot of the settings that can be included within the collection.')}</p>
      <SpecialSettings settings={specialSettings} isToggled={isToggled} toggleEntry={toggleEntry} />
      <GlobalSettings settings={globalSettings} isToggled={isToggled} toggleEntry={toggleEntry} />
    </div>
  ) : (
    <Placeholder />
  );
};

type SpecialSettingsProps = {
  settings: ModOptionsStorage;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};
const SpecialSettings = (props: SpecialSettingsProps) => {
  const { settings, isToggled, toggleEntry } = props;

  const { localize: t } = useLocalization();

  return (
    <div>
      <h5>{t('Special Options')}</h5>
      <ListGroup id="collections-load-order-list">
        {Object.values(settings).map((entry) => (
          <EntryView key={entry.name} entry={entry} isToggled={isToggled} toggleEntry={toggleEntry} />
        ))}
      </ListGroup>
    </div>
  );
};

type GlobalSettingsProps = {
  settings: ModOptionsStorage;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};
const GlobalSettings = (props: GlobalSettingsProps) => {
  const { settings, isToggled, toggleEntry } = props;

  const { localize: t } = useLocalization();

  return (
    <div>
      <h5>{t('Global Options')}</h5>
      <ListGroup id="collections-load-order-list">
        {Object.values(settings).map((entry) => (
          <EntryView key={entry.name} entry={entry} isToggled={isToggled} toggleEntry={toggleEntry} />
        ))}
      </ListGroup>
    </div>
  );
};

type EntryViewProps = {
  entry: ModOptionsEntry;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};
const EntryView = (props: EntryViewProps) => {
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

const Placeholder = () => {
  const { localize: t } = useLocalization();

  return (
    <EmptyPlaceholder
      icon="sort-none"
      text={t('You have no Mod Configuration Menu options available')}
      subtext={t('This collection will not have any Mod Configuration Menu options available.')}
    />
  );
};

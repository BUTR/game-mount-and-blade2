import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { tooltip, types } from 'vortex-api';
import { GAME_ID } from '../../../common';
import { GlobalSettings, Placeholder, SpecialSettings } from '../components';
import { ICollectionFeatureProps } from '../../types';
import { useLocalization } from '../../../localization';
import {
  getGlobalSettings,
  getSpecialSettings,
  ModOptionsEntry,
  ModOptionsStorage,
  PersistentModOptionsEntry,
  readSettingsContent,
} from '../../../modoptions';
import { hasStatePersistentCollectionModWithIncludedModOptions, IncludedModOptions } from '../../../collections';
import { nameof } from '../../../nameof';

export type ModOptionsDataPageProps = ICollectionFeatureProps;

export const ModOptionsDataPage = (props: ModOptionsDataPageProps): JSX.Element => {
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

  const toggleEntry = useCallback(
    (newValue: boolean, entry: ModOptionsEntry) => {
      const newEntries: PersistentModOptionsEntry[] = newValue
        ? [...includedModOptions, { ...entry, contentBase64: readSettingsContent(entry) }]
        : includedModOptions.filter((x) => x.name !== entry.name);
      onSetCollectionAttribute([nameof<IncludedModOptions>('includedModOptions')], newEntries);
    },
    [includedModOptions, onSetCollectionAttribute]
  );

  const isToggled = (entry: ModOptionsEntry): boolean => {
    return includedModOptions.some((x) => x.name === entry.name);
  };

  const setSettings = async (): Promise<void> => {
    setSpecialSettings(getSpecialSettings());
    setGlobalSettings(await getGlobalSettings());
  };

  useEffect(() => {
    setSettings().catch(() => {});
  }, []);

  return Object.values(globalSettings).length ? (
    <div style={{ overflow: 'auto' }}>
      <h4>{t('Mod Configuration Options')}</h4>
      <p>{t('This is a snapshot of the settings that can be included within the collection.')}</p>
      <tooltip.Button tooltip={''} onClick={async () => await setSettings()}>
        {t('Reload')}
      </tooltip.Button>
      <SpecialSettings settings={specialSettings} isToggled={isToggled} toggleEntry={toggleEntry} />
      <GlobalSettings settings={globalSettings} isToggled={isToggled} toggleEntry={toggleEntry} />
    </div>
  ) : (
    <Placeholder />
  );
};

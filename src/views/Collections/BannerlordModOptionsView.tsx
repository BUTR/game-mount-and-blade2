import React, { useEffect, useState } from 'react';
import { ListGroup, ListGroupItem } from 'react-bootstrap';
import { EmptyPlaceholder } from 'vortex-api';
import turbowalk from 'turbowalk';
import path from 'path';
import { ICollectionFeatureProps, useLocalization } from '../../utils';

type SettingsEntry = {
  name: string;
  path: string;
};

type Settings = {
  [key: string]: SettingsEntry;
};

interface IProps extends ICollectionFeatureProps {}

export type BannerlordModOptionsViewProps = ICollectionFeatureProps;

export const BannerlordModOptionsView = (props: IProps) => {
  const { localize: t } = useLocalization();

  const [globalSettings, setGlobalSettings] = useState<Settings>({});

  useEffect(() => {
    async function setSettings() {
      const globalSettings = await getGlobalSettings();
      setGlobalSettings(globalSettings);
    }

    setSettings();
  }, []);

  return globalSettings && Object.values(globalSettings).length !== 0 ? (
    <div style={{ overflow: 'auto' }}>
      <h4>{t('Mod Configuration Options')}</h4>
      <p>{t('This is a snapshot of the settings that can be included within the collection.')}</p>
      <h5>{t('Global Settings')}</h5>
      <ListGroup id="collections-load-order-list">{Object.values(globalSettings).map(EntryView)}</ListGroup>
    </div>
  ) : (
    <Placeholder />
  );
};

const getGlobalSettings = async () => {
  const globalSettingsDictionary: Settings = {};
  const gsPath = 'C:/Users/User/Documents/Mount and Blade II Bannerlord/Configs/ModSettings/Global';
  await turbowalk(
    gsPath,
    (entries) => {
      const settingFiles = entries.filter((entry) => !entry.isDirectory);
      for (const file of settingFiles) {
        const fullPath = file.filePath;
        const relativePath = path.relative(gsPath, fullPath);
        const name = path.basename(relativePath);
        const extension = path.extname(relativePath);
        const modName = name.slice(0, name.length - extension.length);
        globalSettingsDictionary[modName] = {
          name: relativePath,
          path: fullPath,
        };
      }
    },
    { recurse: true }
  );
  return globalSettingsDictionary;
};

const EntryView = (entry: SettingsEntry | undefined) => {
  if (!entry) {
    return null;
  }

  const key = entry.name;
  const name = entry.name;
  const classes = ['load-order-entry', 'collection-tab'];

  return (
    <ListGroupItem key={key} className={classes.join(' ')}>
      <p className="load-order-name">{name}</p>
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

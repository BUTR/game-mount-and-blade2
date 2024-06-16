import React, { useCallback, useEffect, useState } from 'react';
import ticksToDate from 'ticks-to-date';
import { IconBar, ITableRowAction, MainPage, selectors, ToolbarIcon, types } from 'vortex-api';
import { useSelector, useStore } from 'react-redux';
import { Content, RadioView, StatusView } from '../components';
import { ISaveGame } from '../types';
import { getSaves } from '../utils';
import {
  actionsSave,
  findBLSEMod,
  getSaveFromSettings,
  isModActive,
  LocalizationManager,
  useLocalization,
  versionToString,
  VortexLauncherManager,
} from '../../../utils';

interface IFromState {
  profile: types.IProfile | undefined;
  saveName: string;
  hasBLSE: boolean;
}

export type SavePageProps = {
  context: types.IExtensionContext;
};

export const SavePage = (props: SavePageProps): JSX.Element => {
  const { context } = props;

  const localizationManager = useLocalization();
  const { localize: t } = localizationManager;

  const { profile, saveName, hasBLSE } = useSelector(mapState);

  const store = useStore();

  const mainButtonList = [
    {
      component: ToolbarIcon,
      props: () => ({
        id: `btn-refresh-list`,
        key: `btn-refresh-list`,
        icon: `refresh`,
        text: t(`Refresh`),
        className: `load-order-refresh-list`,
        onClick: (): void => {
          reloadSaves();
        },
      }),
    },
  ];
  const saveActions: ITableRowAction[] = [];

  const [selectedRowSave, setSelectedRowSave] = useState<ISaveGame | null>(null);
  const [selectedSave, setSelectedSave] = useState<ISaveGame | null>(null);

  const [sortedSaveGameList, setSortedSaveGames] = useState<[string, ISaveGame][]>([]);

  const saveRowSelected = (save: ISaveGame): void => {
    setSelectedRowSave(save);
  };

  const setSave = useCallback(
    (api: types.IExtensionApi, saveId: string | null): void => {
      if (profile) {
        store.dispatch(actionsSave.setCurrentSave(profile.id, saveId));
      }

      const launcherManager = VortexLauncherManager.getInstance(api);
      launcherManager.setSaveFile(saveId ?? '');
    },
    [profile, store]
  );

  const saveSelected = useCallback(
    (save: ISaveGame) => {
      if (save.index !== 0) {
        setSave(context.api, save.name);
      } else {
        setSave(context.api, null);
      }

      setSelectedSave(save);
    },
    [context.api, setSave]
  );

  const reloadSaves = useCallback(() => {
    const saveList = getSaves(context.api);
    setSortedSaveGames(Object.entries(saveList).sort((a, b) => a[1].index - b[1].index));

    const foundSave = Object.values(saveList).find((value) => value.name === saveName);
    if (foundSave) {
      setSelectedSave(foundSave);
      setSelectedRowSave(foundSave);
    } else {
      setSelectedSave(null);
      setSelectedRowSave(null);
      setSave(context.api, null);
    }
  }, [context.api, saveName, setSave]);

  useEffect(() => {
    reloadSaves();
  }, [reloadSaves]);

  return (
    <MainPage>
      <MainPage.Header>
        <IconBar
          group="bannerlord-saves-icons"
          staticElements={mainButtonList}
          className="menubar"
          t={context.api.translate}
        />
      </MainPage.Header>
      <MainPage.Body>
        {Content({
          selectedSave: selectedSave,
          saveActions: saveActions,
          sortedSaveGameList: sortedSaveGameList,
          tableAttributes: getTableAttributes(context.api, hasBLSE, selectedSave, saveSelected),
          selectedRowSave: selectedRowSave,
          saveRowSelected: saveRowSelected,
        })}
      </MainPage.Body>
    </MainPage>
  );
};

const getTableAttributes = (
  api: types.IExtensionApi,
  hasBLSE: boolean,
  selectedSave: ISaveGame | null,
  saveSelected: (save: ISaveGame) => void
): types.ITableAttribute<[string, ISaveGame]>[] => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const tableAttributes: types.ITableAttribute<[string, ISaveGame]>[] = [
    {
      id: '#',
      name: '#',
      customRenderer: (data): JSX.Element => {
        if (data.length && typeof data[0] === 'string' && !Array.isArray(data[1])) {
          const save = data[1];
          return (
            <RadioView api={api} hasBLSE={hasBLSE} save={save} selectedSave={selectedSave} onChange={saveSelected} />
          );
        }
        return <></>;
      },
      placement: 'both',
      edit: {},
    },
    {
      id: 'name',
      name: t('{=JtelOsIW}Name'),
      calc: (data) => data[1].name,
      placement: 'both',
      edit: {},
    },
    {
      id: 'characterName',
      name: t('{=OJsGrGVi}Character'),
      calc: (data) => data[1].characterName ?? '',
      placement: 'both',
      edit: {},
    },
    {
      id: 'mainHeroLevel',
      name: t('{=JxpEEQdF}Level'),
      calc: (data) => data[1].mainHeroLevel ?? '',
      placement: 'both',
      edit: {},
    },
    {
      id: 'dayLong',
      name: t('{=qkkTPycE}Days'),
      calc: (data) => data[1].dayLong?.toFixed(0) ?? '',
      placement: 'both',
      edit: {},
    },
    {
      id: 'status',
      name: t('Status'),
      customRenderer: (data): JSX.Element => {
        if (data.length && typeof data[0] === 'string' && !Array.isArray(data[1])) {
          const save = data[1];
          return <StatusView api={api} save={save} />;
        }
        return <></>;
      },
      placement: 'both',
      edit: {},
    },
    {
      id: 'applicationVersion',
      name: t('{=14WBFIS1}Version'),
      calc: (data) => (data[1].applicationVersion ? versionToString(data[1].applicationVersion) : ''),
      placement: 'both',
      edit: {},
    },
    {
      id: 'creationTime',
      name: t('{=aYWWDkKX}CreatedAt'),
      calc: (data) => ticksToDate(data[1].creationTime)?.toLocaleString(),
      placement: 'both',
      edit: {},
    },
  ];
  return tableAttributes;
};

const mapState = (state: types.IState): IFromState => {
  const profile: types.IProfile | undefined = selectors.activeProfile(state);

  const saveName = profile !== undefined ? getSaveFromSettings(state, profile.id) ?? 'No Save' : 'No Save';

  const blseMod = findBLSEMod(state);
  const hasBLSE = blseMod !== undefined && profile !== undefined && isModActive(profile, blseMod);

  return {
    profile: profile,
    saveName: saveName,
    hasBLSE: hasBLSE,
  };
};

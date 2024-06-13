import React, { useCallback, useEffect, useState } from 'react';
import { Panel, Radio } from 'react-bootstrap';
import ticksToDate from 'ticks-to-date';
import {
  FlexLayout,
  IconBar,
  ITableRowAction,
  MainPage,
  selectors,
  Table,
  ToolbarIcon,
  tooltip,
  types,
} from 'vortex-api';
import { BannerlordModuleManager, types as vetypes } from '@butr/vortexextensionnative';
import { getLoadOrderIssues, getMismatchedModuleVersions, getMissingModuleNames, getNameDuplicates } from './utils';
import { ISaveGame } from './types';
import {
  findBLSEMod,
  isModActive,
  LocalizationManager,
  useLocalization,
  useSave,
  versionToString,
  VortexLauncherManager,
} from '../../utils';
import { IModuleCache } from '../../types';

interface IProps {
  context: types.IExtensionContext;
}

export type SavePageProps = IProps;

export const SavePage = (props: IProps) => {
  const { context } = props;

  const localizationManager = useLocalization();
  const { localize: t } = localizationManager;

  const saveManager = useSave();

  const profile = selectors.activeProfile(context.api.getState());

  const blseMod = findBLSEMod(context.api);
  const hasBLSE = !!blseMod && isModActive(profile, blseMod);

  const mainButtonList = [
    {
      component: ToolbarIcon,
      props: () => ({
        id: `btn-refresh-list`,
        key: `btn-refresh-list`,
        icon: `refresh`,
        text: t(`Refresh`),
        className: `load-order-refresh-list`,
        onClick: () => {
          reloadSaves();
        },
      }),
    },
  ];
  const saveActions: ITableRowAction[] = [];

  const [selectedRowSave, setSelectedRowSave] = useState<ISaveGame | null>(null);
  const [selectedSave, setSelectedSave] = useState<ISaveGame | null>(null);

  const [sortedSaveGameList, setSortedSaveGames] = useState<[string, ISaveGame][]>([]);

  const saveRowSelected = (save: ISaveGame) => {
    setSelectedRowSave(save);
  };

  const saveSelected = useCallback(
    (save: ISaveGame) => {
      if (save.index !== 0) {
        saveManager.setSave(save.name);
      } else {
        saveManager.setSave(null);
      }

      setSelectedSave(save);
    },
    [saveManager]
  );

  const reloadSaves = useCallback(() => {
    const saveList = getSaves(context.api);
    setSortedSaveGames(Object.entries(saveList).sort((a, b) => a[1].index - b[1].index));

    const saveName = saveManager.getSave() ?? 'No Save';
    const foundSave = Object.values(saveList).find((value) => value.name === saveName);
    if (foundSave) {
      setSelectedSave(foundSave);
      setSelectedRowSave(foundSave);
    } else {
      setSelectedSave(null);
      setSelectedRowSave(null);
      saveManager.setSave(null);
    }
  }, [context.api, saveManager]);

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
) => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const tableAttributes: types.ITableAttribute<[string, ISaveGame]>[] = [
    {
      id: '#',
      name: '#',
      customRenderer: (data) => {
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
      customRenderer: (data) => {
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

const createSaveGame = (
  api: types.IExtensionApi,
  allModules: Readonly<IModuleCache>,
  current: vetypes.SaveMetadata,
  currentIndex: number
) => {
  if (!current['Modules']) {
    return undefined;
  }

  const saveGame: ISaveGame = {
    index: currentIndex + 1,
    name: current.Name,
    applicationVersion:
      current['ApplicationVersion'] !== undefined
        ? BannerlordModuleManager.parseApplicationVersion(current['ApplicationVersion'])
        : undefined,
    creationTime: current['CreationTime'] !== undefined ? parseInt(current['CreationTime']) : undefined,
    characterName: current['CharacterName'],
    mainHeroGold: current['MainHeroGold'] !== undefined ? parseInt(current['MainHeroGold']) : undefined,
    mainHeroLevel: current['MainHeroLevel'] !== undefined ? parseInt(current['MainHeroLevel']) : undefined,
    dayLong: current['DayLong'] !== undefined ? parseFloat(current['DayLong']) : undefined,

    clanBannerCode: current['ClanBannerCode'],
    clanFiefs: current['ClanFiefs'] !== undefined ? parseInt(current['ClanFiefs']) : undefined,
    clanInfluence: current['ClanInfluence'] !== undefined ? parseFloat(current['ClanInfluence']) : undefined,

    mainPartyFood: current['MainPartyFood'] !== undefined ? parseFloat(current['MainPartyFood']) : undefined,
    mainPartyHealthyMemberCount:
      current['MainPartyHealthyMemberCount'] !== undefined
        ? parseInt(current['MainPartyHealthyMemberCount'])
        : undefined,
    mainPartyPrisonerMemberCount:
      current['MainPartyPrisonerMemberCount'] !== undefined
        ? parseInt(current['MainPartyPrisonerMemberCount'])
        : undefined,
    mainPartyWoundedMemberCount:
      current['MainPartyWoundedMemberCount'] !== undefined
        ? parseInt(current['MainPartyWoundedMemberCount'])
        : undefined,
    version: current['Version'] !== undefined ? parseInt(current['Version']) : undefined,
    modules: {}, // blank dictionary for now
  };

  // build up modules dictionary?
  const moduleNames = current['Modules'].split(';');

  const saveChangeSet = saveGame.applicationVersion?.changeSet ?? 0;
  for (const module of moduleNames) {
    const key = module;
    const moduleValue = current['Module_' + module];
    if (!moduleValue) {
      continue;
    }

    const version = BannerlordModuleManager.parseApplicationVersion(moduleValue);
    if (version.changeSet === saveChangeSet) {
      version.changeSet = 0;
    }
    saveGame.modules[key] = version;
  }

  saveGame.duplicateModules = getNameDuplicates(allModules);
  saveGame.loadOrderIssues = getLoadOrderIssues(saveGame, allModules);
  saveGame.missingModules = getMissingModuleNames(saveGame, allModules);
  saveGame.mismatchedModuleVersions = getMismatchedModuleVersions(api, saveGame, allModules);

  return saveGame;
};

const getSaves = (api: types.IExtensionApi) => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const launcherManager = VortexLauncherManager.getInstance(api);

  const saveList: { [name: string]: ISaveGame } = {
    ['nosave']: {
      index: 0,
      name: t('No Save'),
      modules: {},
    },
  };

  const allModules = launcherManager.getAllModules();
  const saveMetadatas = launcherManager.getSaveFiles();

  saveMetadatas.reduce((prev: { [name: string]: ISaveGame }, current, currentIndex) => {
    const save = createSaveGame(api, allModules, current, currentIndex);
    if (!save) {
      return prev;
    }

    prev[current.Name] = save;

    return prev;
  }, saveList);

  return saveList;
};

type ContentProps = {
  selectedSave: ISaveGame | null;
  saveActions: ITableRowAction[];
  sortedSaveGameList: [string, ISaveGame][];
  tableAttributes: types.ITableAttribute<[string, ISaveGame]>[];
  selectedRowSave: ISaveGame | null;
  saveRowSelected: (save: ISaveGame) => void;
};
const Content = (props: ContentProps) => {
  const { selectedSave, saveActions, sortedSaveGameList, tableAttributes, selectedRowSave, saveRowSelected } = props;

  const { localize: t } = useLocalization();

  return (
    <Panel>
      <Panel.Body>
        <FlexLayout type="column">
          <FlexLayout.Fixed id="instructions">
            <p>
              {t(
                `Instructions: Select a row to see more information and use the radio buttons to select the save to ` +
                  `launch the game. If you don't want to launch with a save, choose the 'No Save' option at` +
                  `the top.`
              )}
            </p>
            <p>
              {t(`Currently selected save: `)}
              {selectedSave?.name}
            </p>
          </FlexLayout.Fixed>

          <FlexLayout type="row">
            <FlexLayout.Flex>
              <Table
                tableId="bannerlord-savegames"
                data={sortedSaveGameList}
                staticElements={tableAttributes}
                actions={saveActions}
                multiSelect={false}
                hasActions={false}
                showDetails={false}
                onChangeSelection={(ids: string[]) => saveRowSelected(sortedSaveGameList[parseInt(ids[0]!)]![1])}
              />
            </FlexLayout.Flex>

            <FlexLayout.Fixed id="sidebar">
              <Sidebar save={selectedRowSave} />
            </FlexLayout.Fixed>
          </FlexLayout>
        </FlexLayout>
      </Panel.Body>
    </Panel>
  );
};

type RadioViewProps = {
  api: types.IExtensionApi;
  save: ISaveGame;
  selectedSave: ISaveGame | null;
  hasBLSE: boolean;
  onChange: (save: ISaveGame) => void;
};
// Custom Renderer has no Context access
const RadioView = (props: RadioViewProps) => {
  const { api, save, selectedSave, hasBLSE, onChange } = props;

  return hasBLSE ? (
    <Radio
      name="radioGroup"
      defaultChecked={save.name === selectedSave?.name}
      id={`bannerlord-savegames-radio${save.index}`}
      onChange={() => onChange(save)}
    />
  ) : (
    <div />
  );
};

type StatusViewProps = {
  api: types.IExtensionApi;
  save: ISaveGame;
};
// Custom Renderer has no Context access
const StatusView = (props: StatusViewProps) => {
  const appendIssues = (allIssues: string[], issues: string[] | undefined, message: string) => {
    if (issues && issues.length) {
      allIssues.push(`${issues.length} ${message}`);
    }
  };

  const { api, save } = props;

  const { localize: t } = LocalizationManager.getInstance(api);

  const allIssues: string[] = [];
  appendIssues(allIssues, save.loadOrderIssues, t('load order issues'));
  appendIssues(allIssues, save.missingModules, t('missing modules'));
  appendIssues(allIssues, save.duplicateModules, t('duplicate modules'));
  appendIssues(allIssues, save.mismatchedModuleVersions, t('version mismatches'));

  const icon = allIssues.length === 0 ? 'toggle-enabled' : 'feedback-warning';
  const color = allIssues.length === 0 ? 'var(--brand-success)' : 'var(--brand-danger)';

  return <tooltip.Icon name={icon} tooltip={allIssues.join('\n')} style={{ color: color }} />;
};

const IssueSnippet = (issueHeading: string, issue: string[] | undefined) => {
  if (issue && issue.length) {
    return (
      <>
        <p>{issueHeading}</p>
        <ul>
          {issue.map((object, i) => (
            <li key={i}>{object}</li>
          ))}
        </ul>
      </>
    );
  }

  return <></>;
};

type SidebarProps = {
  save: ISaveGame | null;
};
const Sidebar = (props: SidebarProps): JSX.Element => {
  const { save } = props;

  const { localize: t } = useLocalization();

  // if nothing is selected
  if (!save) {
    return <></>;
  }

  // something is selected
  return (
    <>
      {<h3>{save.name}</h3>}
      {IssueSnippet(
        t('{=HvvA78sZ}Load Order Issues:{NL}{LOADORDERISSUES}', {
          NL: '',
          LOADORDERISSUES: '',
        }),
        save.loadOrderIssues
      )}
      {IssueSnippet(
        t('{=GtDRbC3m}Missing Modules:{NL}{MODULES}', {
          NL: '',
          MODULES: '',
        }),
        save.missingModules
      )}
      {IssueSnippet(
        t('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
          NL: '',
          MODULENAMES: '',
        }),
        save.duplicateModules
      )}
      {IssueSnippet(
        t('{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}', {
          NL: '',
          MODULEVERSIONS: '',
        }),
        save.mismatchedModuleVersions
      )}
    </>
  );
};

import React from 'react';
import { Panel, Radio } from 'react-bootstrap';
import ticksToDate from 'ticks-to-date';
import {
  ComponentEx,
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
import {
  getModulesByName,
  getLoadOrderIssues,
  getMismatchedModuleVersions,
  getMissingModuleNames,
  getNameDuplicates,
} from './saveUtils';
import { ISaveGame } from './types';
import { versionToString } from '../../utils';
import {
  GetLauncherManager,
  GetLocalizationManager,
  GetSaveManager,
  IItemRendererProps,
  IModuleCache,
} from '../../types';
import { IBaseProps as IIconBarBaseProps } from 'vortex-api/lib/controls/IconBar';
import { IActionControlProps } from 'vortex-api/lib/controls/ActionControl';
import { IExtensibleProps } from 'vortex-api/lib/types/IExtensionProvider';
import { IBaseProps as ITableBaseProps } from 'vortex-api/lib/controls/Table';
import { findBLSEMod, isModActive } from '../../utils/blse/shared';

type IOwnProps = IItemRendererProps & {
  context: types.IExtensionContext;
  getLauncherManager: GetLauncherManager;
  getSaveManager: GetSaveManager;
  getLocalizationManager: GetLocalizationManager;
};

interface IBaseState {
  hasBLSE: boolean;
  saves: vetypes.SaveMetadata[];
  allModules: Readonly<IModuleCache>;
  // TODO: Move to the entry renderer
  loadOrder: { [saveName: string]: string };
  selectedRow?: ISaveGame | undefined;
  selectedSave?: ISaveGame | undefined;
}

type IComponentProps = IOwnProps;
type IComponentState = IBaseState;

const TableWrapper = Table as React.ComponentType<ITableBaseProps & IExtensibleProps>;
const IconWrapper = IconBar as React.ComponentType<
  IIconBarBaseProps & IActionControlProps & IExtensibleProps & React.HTMLAttributes<unknown>
>;

export type ISaveListProps = IComponentProps;

// TODO: Reload on localization change
export class SaveList extends ComponentEx<IComponentProps, IComponentState> {
  private mStaticButtons: types.IActionDefinition[];
  private saveGameActions: ITableRowAction[];
  private savesGames: { [name: string]: ISaveGame } = {};
  private tableAttributes: types.ITableAttribute[];
  private storedSaveGameName: string | undefined = undefined;
  private sortedSaveGames: [string, ISaveGame][] = [];

  // eslint-disable-next-line max-lines-per-function
  constructor(props: IComponentProps) {
    super(props);

    const { context, getLauncherManager, getSaveManager, getLocalizationManager } = props;
    const launcherManager = getLauncherManager();
    const saveManager = getSaveManager();
    const localizationManager = getLocalizationManager();
    const t = localizationManager.localize;

    const vortexState = context.api.getState();
    const vortexActiveProfile = selectors.activeProfile(vortexState);

    const blseMod = findBLSEMod(context.api);
    const hasBLSE = !!blseMod && isModActive(vortexActiveProfile, blseMod);
    const saves = launcherManager.getSaveFiles();
    const allModules = launcherManager.getAllModules();

    // need to init the state so it saves with vortex
    this.initState({
      hasBLSE,
      saves,
      allModules: allModules,
      loadOrder: {},
    });

    // get list of save games
    this.reloadSaves();

    this.storedSaveGameName = saveManager.getSave() ?? 'No Save';
    if (this.storedSaveGameName) {
      const foundSave = Object.values(this.savesGames).find((value) => value.name === this.storedSaveGameName);
      if (foundSave) {
        this.setState({ selectedSave: foundSave, selectedRow: foundSave });
      } else {
        this.storedSaveGameName = 'No Save';
        saveManager.setSave(null);
      }
    } else {
      this.storedSaveGameName = 'No Save';
      saveManager.setSave(null);
    }

    this.mStaticButtons = [
      {
        component: ToolbarIcon,
        props: () => ({
          id: `btn-refresh-list`,
          key: `btn-refresh-list`,
          icon: `refresh`,
          text: t(`Refresh`),
          className: `load-order-refresh-list`,
          onClick: () => this.reloadSaves(),
        }),
      },
    ];

    this.saveGameActions = [];

    // basically column data
    this.tableAttributes = [
      {
        id: '#',
        name: '#',
        customRenderer: (data: [string, ISaveGame]) => this.GetRadioCustomRenderer(data[1], this.storedSaveGameName),
        placement: 'both',
        edit: {},
      },
      {
        id: 'name',
        name: t('{=JtelOsIW}Name'),
        calc: (data: [string, ISaveGame]) => data[1].name,
        placement: 'both',
        edit: {},
      },
      {
        id: 'characterName',
        name: t('{=OJsGrGVi}Character'),
        calc: (data: [string, ISaveGame]) => data[1].characterName ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'mainHeroLevel',
        name: t('{=JxpEEQdF}Level'),
        calc: (data: [string, ISaveGame]) => data[1].mainHeroLevel ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'dayLong',
        name: t('{=qkkTPycE}Days'),
        calc: (data: [string, ISaveGame]) => data[1].dayLong?.toFixed(0) ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'status',
        name: t('Status'),
        customRenderer: (data: [string, ISaveGame]) => this.StatusCustomRenderer(data[1]),
        placement: 'both',
        edit: {},
      },
      {
        id: 'applicationVersion',
        name: t('{=14WBFIS1}Version'),
        calc: (data: [string, ISaveGame]) =>
          data[1].applicationVersion ? versionToString(data[1].applicationVersion) : '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'creationTime',
        name: t('{=aYWWDkKX}CreatedAt'),
        calc: (data: [string, ISaveGame]) => ticksToDate(data[1].creationTime)?.toLocaleString(),
        placement: 'both',
        edit: {},
      },
    ];
  }

  public override render(): JSX.Element {
    const { context } = this.props;

    const t = context.api.translate;

    return (
      <MainPage>
        <MainPage.Header>
          <IconWrapper group="bannerlord-saves-icons" staticElements={this.mStaticButtons} className="menubar" t={t} />
        </MainPage.Header>
        <MainPage.Body>{this.renderContent(this.saveGameActions)}</MainPage.Body>
      </MainPage>
    );
  }

  private renderContent(saveActions: ITableRowAction[]) {
    const { getLocalizationManager } = this.props;
    const { selectedRow, selectedSave } = this.state;

    const localizationManager = getLocalizationManager();
    const t = localizationManager.localize;

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
                <TableWrapper
                  tableId="bannerlord-savegames"
                  data={this.sortedSaveGames}
                  staticElements={this.tableAttributes}
                  actions={saveActions}
                  multiSelect={false}
                  hasActions={false}
                  showDetails={false}
                  onChangeSelection={(ids: string[]) =>
                    this.Table_OnChangeSelection(this.sortedSaveGames[parseInt(ids[0]!)]![1])
                  }
                />
              </FlexLayout.Flex>

              <FlexLayout.Fixed id="sidebar">{this.RenderSidebar(selectedRow)}</FlexLayout.Fixed>
            </FlexLayout>
          </FlexLayout>
        </Panel.Body>
      </Panel>
    );
  }

  private Table_OnChangeSelection(saveGame: ISaveGame) {
    // when a row is selected

    //const selectedIndex = parseInt(ids[0]);

    // get current state object
    let { selectedRow } = this.state;

    // get save game from selected row index
    //const saveGame = this.sortedSaveGames[selectedIndex][1];

    //console.log(`BANNERLORD: OnChangeSelection(${ids}) selectedIndex=${selectedIndex} saveGame=`);
    //console.log(saveGame);

    // update it
    selectedRow = saveGame;

    // save it
    this.setState({ selectedRow });
  }
  private RenderSidebar(saveGame: ISaveGame | undefined): JSX.Element {
    const { getLocalizationManager } = this.props;

    const localizationManager = getLocalizationManager();
    const t = localizationManager.localize;

    // if nothing is selected
    if (!saveGame) {
      return <></>;
    }

    // something is selected
    return (
      <>
        {<h3>{saveGame.name}</h3>}
        {this.GetIssueRenderSnippet(
          t('{=HvvA78sZ}Load Order Issues:{NL}{LOADORDERISSUES}', {
            NL: '',
            LOADORDERISSUES: '',
          }),
          saveGame.loadOrderIssues
        )}
        {this.GetIssueRenderSnippet(
          t('{=GtDRbC3m}Missing Modules:{NL}{MODULES}', {
            NL: '',
            MODULES: '',
          }),
          saveGame.missingModules
        )}
        {this.GetIssueRenderSnippet(
          t('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
            NL: '',
            MODULENAMES: '',
          }),
          saveGame.duplicateModules
        )}
        {this.GetIssueRenderSnippet(
          t('{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}', {
            NL: '',
            MODULEVERSIONS: '',
          }),
          saveGame.mismatchedModuleVersions
        )}
      </>
    );
  }
  private GetIssueRenderSnippet(issueHeading: string, issue: string[] | undefined): JSX.Element {
    // if we have something in the issue array, then return that nicely formatted
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
  }

  // Table
  private GetRadioCustomRenderer(saveGame: ISaveGame, storedSaveGame: string | undefined): JSX.Element {
    const { hasBLSE } = this.state;

    return hasBLSE ? (
      <Radio
        name="radioGroup"
        defaultChecked={saveGame.name === storedSaveGame}
        id={`bannerlord-savegames-radio${saveGame.index}`}
        onChange={() => this.Radio_OnChange(saveGame)}
      ></Radio>
    ) : (
      <div />
    );
  }
  private Radio_OnChange(saveGame: ISaveGame) {
    // when a save is selected that we need to send to launcher

    //console.log(`BANNERLORD: Radio_OnChange(${saveGame.name}) saveGame=`);
    //console.log(saveGame);

    const { getSaveManager } = this.props;
    const saveManager = getSaveManager();

    // get current state object
    let { selectedSave } = this.state;

    // update it
    selectedSave = saveGame;

    // save it in local state
    this.setState({ selectedSave });

    if (saveGame.index !== 0) {
      saveManager.setSave(saveGame.name);
    } else {
      saveManager.setSave(null);
    }
  }

  private checkIssues(
    issueArray: string[] | undefined,
    iconName: string,
    colorName: string,
    issueMessage: string
  ): [string, string, string[]] {
    let newIconName = iconName;
    let newColorName = colorName;
    const issues: string[] = [];

    if (issueArray && issueArray.length) {
      newIconName = 'feedback-warning';
      newColorName = 'var(--brand-danger)';
      issues.push(`${issueArray.length} ${issueMessage}`);
    }

    return [newIconName, newColorName, issues];
  }

  // Table
  private StatusCustomRenderer(saveGame: ISaveGame): JSX.Element {
    const { getLocalizationManager } = this.props;

    const localizationManager = getLocalizationManager();
    const t = localizationManager.localize;

    let iconName = 'toggle-enabled';
    let colorName = 'var(--brand-success)';
    let issues: string[] = [];

    [iconName, colorName, issues] = this.checkIssues(
      saveGame.loadOrderIssues,
      iconName,
      colorName,
      t('load order issues')
    );
    [iconName, colorName, issues] = this.checkIssues(
      saveGame.missingModules,
      iconName,
      colorName,
      t('missing modules')
    );
    [iconName, colorName, issues] = this.checkIssues(
      saveGame.duplicateModules,
      iconName,
      colorName,
      t('duplicate modules')
    );
    [iconName, colorName, issues] = this.checkIssues(
      saveGame.mismatchedModuleVersions,
      iconName,
      colorName,
      t('version mismatches')
    );

    return <tooltip.Icon name={iconName} tooltip={issues.join('\n')} style={{ color: colorName }} />;
  }

  private reloadSaves() {
    const { getLauncherManager, getLocalizationManager } = this.props;

    const launcherManager = getLauncherManager();
    const localizationManager = getLocalizationManager();
    const t = localizationManager.localize;

    const saves: vetypes.SaveMetadata[] = launcherManager.getSaveFiles();
    const allModules = launcherManager.getAllModules();

    // build new ISaveGame from SaveMetadata, just to make it easier to work with

    // add starting entry to top of list (didn't work as numbers got added first, but we are setting the index anyway to sort later)
    this.savesGames['nosave'] = {
      index: 0,
      name: t('No Save'),
      modules: {},
    };

    // add savesDict as starting object and keep adding to it
    saves.reduce((prev: { [name: string]: ISaveGame }, current, currentIndex) => {
      const saveGame = this.createSaveGame(allModules, current, currentIndex);
      if (!saveGame) {
        return prev;
      }

      this.parseSave(allModules, saveGame);
      prev[current.Name] = saveGame;

      return prev;
    }, this.savesGames);

    // build up saves object ready for table display

    // add tempSaves built from the launcher
    //this.savesDict = Object.assign(this.savesDict, tempSaves);

    this.sortedSaveGames = Object.entries(this.savesGames).sort((a, b) => a[1].index - b[1].index);

    this.setState({
      saves,
      allModules: allModules,
    });
  }

  private parseSave(allModules: Readonly<IModuleCache>, saveGame: ISaveGame) {
    const { getLocalizationManager } = this.props;
    const { loadOrder } = this.state;

    const localizationManager = getLocalizationManager();
    const t = localizationManager.localize;

    const allModulesByName = getModulesByName(allModules);
    const unknownId = t('{=kxqLbSqe}(Unknown ID)');
    const newLoadOrder = { ...loadOrder };

    Object.keys(saveGame.modules).forEach((current) => {
      const moduleId = allModulesByName[current]?.id ?? `${current} ${unknownId}`;
      if (moduleId !== undefined) {
        newLoadOrder[saveGame.name] = t('{=sd6M4KRd}Load Order:{NL}{LOADORDER}', {
          LOADORDER: moduleId,
        });
      }
    });

    this.setState({ loadOrder: newLoadOrder });
  }

  private createSaveGame(allModules: Readonly<IModuleCache>, current: vetypes.SaveMetadata, currentIndex: number) {
    if (!current['Modules']) {
      return undefined;
    }

    const { getLocalizationManager } = this.props;

    const localizationManager = getLocalizationManager();

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
    saveGame.mismatchedModuleVersions = getMismatchedModuleVersions(saveGame, localizationManager, allModules);

    return saveGame;
  }
}

import * as React from 'react';
import { Panel, ListGroup, ListGroupItem, Alert, Radio, FormControl } from 'react-bootstrap';
import {
  ComponentEx,
  FlexLayout,
  IconBar,
  ITableRowAction,
  MainPage,
  Table,
  ToolbarIcon,
  tooltip,
  types,
  util,
} from 'vortex-api';
import { BannerlordModuleManager, types as vetypes } from '@butr/vortexextensionnative';
import { IItemRendererProps, IModuleCache } from '../../types';
import { VortexLauncherManager } from '../../utils/VortexLauncherManager';
import { versionToString } from '../../utils/util';
import {
  getAvailableModulesByName,
  getLoadOrderIssues,
  getMismatchedModuleVersionsWarning,
  getMissingModuleNamesError,
  getModules,
  getNameDuplicatesError,
} from './saveUtils';
import ticksToDate from 'ticks-to-date';
import { setCurrentSave, setSortOnDeploy } from '../../actions';

type IOwnProps = IItemRendererProps & {
  launcherManager: VortexLauncherManager;
  context: types.IExtensionContext;
};

interface IBaseState {
  saves: vetypes.SaveMetadata[];
  modules: Readonly<IModuleCache>;
  // TODO: Move to the entry renderer
  loadOrder: { [saveName: string]: string };
  selectedRow: ISaveGame | undefined;
  selectedSave: ISaveGame | undefined;
}

export interface ISaveGame {
  index: number;
  name: string;
  applicationVersion?: vetypes.ApplicationVersion;
  creationTime?: number;
  characterName?: string;
  mainHeroGold?: number;
  mainHeroLevel?: number;
  dayLong?: number;
  clanBannerCode?: string;
  clanFiefs?: number;
  clanInfluence?: number;
  mainPartyFood?: number;
  mainPartyHealthyMemberCount?: number;
  mainPartyPrisonerMemberCount?: number;
  mainPartyWoundedMemberCount?: number;
  version?: number; // always a 1?
  modules: { [name: string]: vetypes.ApplicationVersion }; // key value pair - name of module : version of module
  duplicateModules?: string[];
  loadOrderIssues?: string[];
  missingModules?: string[];
  mismatchedModuleVersions?: string[];
}

type IComponentProps = IOwnProps;
type IComponentState = IBaseState;

const TableWrapper = Table as any;
class SaveList extends ComponentEx<IComponentProps, IComponentState> {
  private mStaticButtons: types.IActionDefinition[];
  private saveGameActions: ITableRowAction[];
  private savesGames: { [name: string]: ISaveGame } = {};
  private tableAttributes: types.ITableAttribute[];
  private storedSaveGameName: string = '';
  private sortedSaveGames: [string, ISaveGame][] = [];

  constructor(props: IComponentProps) {
    super(props);

    const saves: vetypes.SaveMetadata[] = props.launcherManager.getSaveFiles();
    const modules: Readonly<IModuleCache> = props.launcherManager.getModulesVortex();

    // need to init the state so it saves with vortex
    this.initState({
      saves,
      modules,
      loadOrder: {},
      selectedRow: undefined,
      selectedSave: undefined,
    });

    // get list of save games
    this.OnRefreshList();

    // get stored save game from vortex state
    const vortexState: types.IState = props.context.api.getState();
    this.storedSaveGameName = (vortexState.settings as any).mountandblade2?.saveList?.saveName ?? undefined;
    //console.log('storedSaveGame=' + this.storedSaveGameName);

    // if nothing found in the vortex state, then we default to 'no save'
    if (this.storedSaveGameName == undefined) {
      this.storedSaveGameName = 'No Save';
      props.context.api.store?.dispatch(setCurrentSave(this.storedSaveGameName));
      //console.log(vortexState);
    } else {
      const foundSave: ISaveGame | undefined = Object.values(this.savesGames).find(
        (value) => value.name == this.storedSaveGameName
      );

      //console.log(foundSave);

      // if nothing found in the saves then we default to No Save
      if (foundSave == undefined) {
        // no save found, set default name
        this.storedSaveGameName = 'No Save';
      } else {
        // set state to the found save
        this.setState({ selectedSave: foundSave, selectedRow: foundSave });
      }
    }

    this.mStaticButtons = [
      {
        component: ToolbarIcon,
        props: () => ({
          id: `btn-refresh-list`,
          key: `btn-refresh-list`,
          icon: `refresh`,
          text: `Refresh List`,
          className: `load-order-refresh-list`,
          onClick: () => this.OnRefreshList(),
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
        name: 'Name',
        calc: (data: [string, ISaveGame]) => data[1].name,
        placement: 'both',
        edit: {},
      },
      {
        id: 'characterName',
        name: 'Character',
        calc: (data: [string, ISaveGame]) => data[1].characterName ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'mainHeroLevel',
        name: 'Level',
        calc: (data: [string, ISaveGame]) => data[1].mainHeroLevel ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'dayLong',
        name: 'Days',
        calc: (data: [string, ISaveGame]) => data[1].dayLong?.toFixed(0) ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'status',
        name: 'Status',
        customRenderer: (data: [string, ISaveGame]) => this.GetStatusCustomRenderer(data[1]),
        placement: 'both',
        edit: {},
      },
      {
        id: 'applicationVersion',
        name: 'Version',
        calc: (data: [string, ISaveGame]) =>
          data[1].applicationVersion != undefined ? versionToString(data[1].applicationVersion) : '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'creationTime',
        name: 'Created',
        calc: (data: [string, ISaveGame]) => ticksToDate(data[1].creationTime)?.toLocaleString(),
        placement: 'both',
        edit: {},
      },
    ];
  }

  public render(): JSX.Element {
    const { t } = this.props;

    const IconWrapper = IconBar as any;

    return (
      <MainPage>
        <MainPage.Header>
          <IconWrapper group="bannerlord-saves-icons" staticElements={this.mStaticButtons} className="menubar" t={t!} />
        </MainPage.Header>
        <MainPage.Body>{this.renderContent(this.saveGameActions)}</MainPage.Body>
      </MainPage>
    );
  }

  private GetRadioCustomRenderer(saveGame: ISaveGame, storedSaveGame: string): JSX.Element {
    return (
      <Radio
        name="radioGroup"
        defaultChecked={saveGame.name == storedSaveGame}
        id={`bannerlord-savegames-radio${saveGame.index}`}
        onChange={() => this.Radio_OnChange(saveGame)}
      ></Radio>
    );
  }

  private GetStatusCustomRenderer(saveGame: ISaveGame): JSX.Element {
    /* brand colours
     * --brand-success
     * --brand-warning
     * --brand-danger
     */

    // default is all fine
    let iconName = 'toggle-enabled';
    let colorName = 'var(--brand-success)';
    let issues: string[] = [];

    // build up tooltip issues array, and colours if necessary
    // warning is set first, anything else is error, if nothing then we just
    // fallback to the default green

    // warnings
    if (saveGame.loadOrderIssues && saveGame.loadOrderIssues.length) {
      iconName = 'feedback-warning';
      colorName = 'var(--brand-warning)';
      issues.push(saveGame.loadOrderIssues.length + ' load order issues');
    }

    // errors
    if (saveGame.missingModules && saveGame.missingModules.length) {
      iconName = 'feedback-warning';
      colorName = 'var(--brand-danger)';
      issues.push(saveGame.missingModules.length + ' missing modules');
    }

    if (saveGame.duplicateModules && saveGame.duplicateModules.length) {
      iconName = 'feedback-warning';
      colorName = 'var(--brand-danger)';
      issues.push(saveGame.duplicateModules.length + ' duplicate modules');
    }

    if (saveGame.mismatchedModuleVersions && saveGame.mismatchedModuleVersions.length) {
      iconName = 'feedback-warning';
      colorName = 'var(--brand-danger)';
      issues.push(saveGame.mismatchedModuleVersions.length + ' version mismatches');
    }

    return <tooltip.Icon name={iconName} tooltip={issues.join('\n')} style={{ color: colorName }} />;
  }

  private renderContent(saveActions: ITableRowAction[]) {
    const { saves, selectedRow, selectedSave } = this.state;

    return (
      <Panel>
        <Panel.Body>
          <FlexLayout type="column">
            <FlexLayout.Fixed id="instructions">
              <p>
                Instructions: Select a row to see more information and use the radio buttons to select the save to
                launch the game. If you don't want to launch with a save, choose the 'No Save' option at the top.
              </p>
              <p>Currently selected save: {selectedSave?.name}</p>
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
                  onChangeSelection={(ids: string[]) => this.Table_OnChangeSelection(this.sortedSaveGames[parseInt(ids[0])][1])}
                />
              </FlexLayout.Flex>

              <FlexLayout.Fixed id="sidebar">{this.RenderSidebar(selectedRow)}</FlexLayout.Fixed>
            </FlexLayout>
          </FlexLayout>
        </Panel.Body>
      </Panel>
    );
  }

  private Radio_OnChange(saveGame: ISaveGame) {
    // when a save is selected that we need to send to launcher

    console.log(`BANNERLORD: Radio_OnChange(${saveGame.name}) saveGame=`);
    console.log(saveGame);

    const { launcherManager, context } = this.props;

    // get current state object
    let { selectedSave } = this.state;

    // update it
    selectedSave = saveGame;

    // save it in local state
    this.setState({ selectedSave });

    // set vortex state so it stored between sessions
    context.api.store?.dispatch(setCurrentSave(saveGame.name));
    //console.log(context.api.getState());

    // set on launcher. if this is 'no save' then just send empty string
    launcherManager.setGameParameterSaveFile(saveGame.name == 'No Save' ? '' : saveGame.name);
  }

  private Table_OnChangeSelection(saveGame: ISaveGame) {
    // when a row is selected

    //const selectedIndex = parseInt(ids[0]);

    // get current state object
    let { selectedRow } = this.state;

    // get save game from selected row index
    //const saveGame = this.sortedSaveGames[selectedIndex][1];

    //console.log(`BANNERLORD: OnChangeSelection(${ids}) selectedIndex=${selectedIndex} saveGame=`);
    console.log(saveGame);

    // update it
    selectedRow = saveGame;

    // save it
    this.setState({ selectedRow });
  }

  private RenderSidebar(saveGame: ISaveGame | undefined): JSX.Element {
    // if nothing is selected
    if (saveGame == undefined) {
      return <></>;
    }

    // something is selected
    return (
      <>
        {<h3>{saveGame.name}</h3>}
        {this.GetIssueRenderSnippet('Missing Modules', saveGame.missingModules)}
        {this.GetIssueRenderSnippet('Duplicate Modules', saveGame.duplicateModules)}
        {this.GetIssueRenderSnippet('Version Mismatches', saveGame.mismatchedModuleVersions)}
        {this.GetIssueRenderSnippet('Load Order issues', saveGame.loadOrderIssues)}
      </>
    );
  }

  private GetIssueRenderSnippet(issueHeading: string, issue: string[] | undefined): JSX.Element {
    // if we have something in the issue array, then return that nicely formatted
    if (issue && issue.length) {
      return (
        <>
          <p>{issueHeading}:</p>
          <ul>
            {issue.map((object, i) => (
              <li key={i}>{object}</li>
            ))}
          </ul>
        </>
      );
    }

    // default to returning empty fragment
    return (
      <>
        <p>No {issueHeading}</p>
      </>
    );
  }

  private OnRefreshList() {
    const { launcherManager } = this.props;

    console.log(this.props);

    const saves: vetypes.SaveMetadata[] = launcherManager.getSaveFiles();
    const modules = launcherManager.getModulesVortex();

    // build new ISaveGame from SaveMetadata, just to make it easier to work with

    // add starting entry to top of list (didn't work as numbers got added first, but we are setting the index anyway to sort later)
    this.savesGames['nosave'] = {
      index: 0,
      name: 'No Save',
      modules: {},
    };

    // add savesDict as starting object and keep adding to it
    saves.reduce((prev: { [name: string]: ISaveGame }, current, currentIndex) => {
      const saveGame: ISaveGame = {
        index: currentIndex + 1,
        name: current.Name,
        applicationVersion:
          current.ApplicationVersion !== undefined
            ? BannerlordModuleManager.parseApplicationVersion(current.ApplicationVersion)
            : undefined,
        creationTime: current.CreationTime !== undefined ? parseInt(current.CreationTime) : undefined,
        characterName: current.CharacterName,
        mainHeroGold: current.MainHeroGold !== undefined ? parseInt(current.MainHeroGold) : undefined,
        mainHeroLevel: current.MainHeroLevel !== undefined ? parseInt(current.MainHeroLevel) : undefined,
        dayLong: current.DayLong !== undefined ? parseFloat(current.DayLong) : undefined,

        clanBannerCode: current.ClanBannerCode,
        clanFiefs: current.ClanFiefs !== undefined ? parseInt(current.ClanFiefs) : undefined,
        clanInfluence: current.ClanInfluence !== undefined ? parseFloat(current.ClanInfluence) : undefined,

        mainPartyFood: current.MainPartyFood !== undefined ? parseFloat(current.MainPartyFood) : undefined,
        mainPartyHealthyMemberCount:
          current.MainPartyHealthyMemberCount !== undefined ? parseInt(current.MainPartyHealthyMemberCount) : undefined,
        mainPartyPrisonerMemberCount:
          current.MainPartyPrisonerMemberCount !== undefined
            ? parseInt(current.MainPartyPrisonerMemberCount)
            : undefined,
        mainPartyWoundedMemberCount:
          current.MainPartyWoundedMemberCount !== undefined ? parseInt(current.MainPartyWoundedMemberCount) : undefined,
        version: current.Version !== undefined ? parseInt(current.Version) : undefined,
        modules: {}, // blank dictionary for now
      };

      // build up modules dictionary?
      const moduleNames: string[] = current.Modules.split(';');

      const saveChangeSet = saveGame.applicationVersion?.changeSet ?? 0;
      for (const module of moduleNames) {
        const key: string = module;
        const value: string = current['Module_' + module];

        // skip this if it's undefined
        if (value == undefined) continue;

        const version = BannerlordModuleManager.parseApplicationVersion(value);
        if (version.changeSet === saveChangeSet) {
          version.changeSet = 0;
        }
        saveGame.modules[key] = version;
      }

      this.ParseSave(saveGame);
      this.ValidateSave(saveGame);
      prev[current.Name] = saveGame;

      return prev;
    }, this.savesGames);

    // build up saves object ready for table display

    // add tempSaves built from the launcher
    //this.savesDict = Object.assign(this.savesDict, tempSaves);

    this.sortedSaveGames = Object.entries(this.savesGames).sort((a, b) => a[1].index - b[1].index);

    //console.log(this.savesGames);
    //console.log(this.sortedSaveGames);

    this.setState({
      saves,
      modules,
    });

    //console.log(`BANNERLORD: OnRefreshList() this.savesDict= saves=`);
    //console.log(this.savesGames);
    //console.log(saves);
    //console.log(modules);
  }

  private ParseSave(saveGame: ISaveGame) {
    const { launcherManager } = this.props;
    const { loadOrder } = this.state;

    const availableModules = launcherManager.getModulesVortex();
    const availableModulesByName = getAvailableModulesByName(availableModules);
    const unknownId = launcherManager.localize('{=kxqLbSqe}(Unknown ID)', {});
    const modules = Object.keys(saveGame.modules)
      .map((current) => {
        return availableModulesByName[current]?.id ?? `${current} ${unknownId}`;
      })
      .filter((x) => x !== undefined);

    loadOrder[saveGame.name] = launcherManager.localize('{=sd6M4KRd}Load Order:{NL}{LOADORDER}', {
      LOADORDER: modules.join('\n'),
    });
    this.setState({ loadOrder });
  }

  private ValidateSave(saveGame: ISaveGame) {
    const { launcherManager } = this.props;

    const availableModules = launcherManager.getModulesVortex();

    /*
    if (nameDuplicates !== undefined) {
      errorHints[saveGame.name] = launcherManager.localize('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
        MODULENAMES: Object.values(nameDuplicates).join('\n'),
      });
      this.setState({ errorHints });
      return;
    }*/

    saveGame.duplicateModules = getNameDuplicatesError(saveGame, launcherManager, availableModules);
    saveGame.loadOrderIssues = getLoadOrderIssues(saveGame, launcherManager, availableModules);
    saveGame.missingModules = getMissingModuleNamesError(saveGame, launcherManager, availableModules);
    saveGame.mismatchedModuleVersions = getMismatchedModuleVersionsWarning(saveGame, launcherManager, availableModules);

    //console.log(`BANNERLORD: ValidateSave() saveGame=`);
    //console.log(saveGame);

    /*
    if (loadOrderIssues.length > 0 || missingModules.length > 0) {
      let str = '';
      if (loadOrderIssues.length > 0) {
        str += launcherManager.localize('{=HvvA78sZ}Load Order Issues:{NL}{LOADORDERISSUES}', {
          LOADORDERISSUES: loadOrderIssues.join('\n\n'),
        });
        str += missingModules !== undefined ? '\n\n\n' : '';
      }
      if (missingModules.length > 0) {
        str += launcherManager.localize('{=GtDRbC3m}Missing Modules:{NL}{MODULES}', {
          MODULES: missingModules.join('\n'),
        });
      }
      errorHints[saveGame.name] = str;
      this.setState({ errorHints });
      return;
    }*/

    //saveGame.mismatchedModuleVersions = getMismatchedModuleVersionsWarning(saveGame, launcherManager, availableModules);

    /*
    if (mismatchedModuleVersions !== undefined) {
      warningHints[saveGame.name] = launcherManager.localize(
        '{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}',
        {
          MODULEVERSIONS: mismatchedModuleVersions,
        }
      );
      this.setState({ warningHints });
    }*/
  }
}

export default SaveList;

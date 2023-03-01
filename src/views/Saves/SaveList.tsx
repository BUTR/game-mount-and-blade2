import * as React from 'react';
import { Panel, ListGroup, ListGroupItem, Alert, Radio } from 'react-bootstrap';
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
} from 'vortex-api';
import { BannerlordModuleManager, types as vetypes } from '@butr/vortexextensionnative';
import SaveEntry from './SaveListEntry';
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
import { IExtensionContext } from 'vortex-api/lib/types/IExtensionContext';

interface IStateProps {}
type IOwnProps = IItemRendererProps & {
  launcherManager: VortexLauncherManager;
  context: IExtensionContext;
};

interface IBaseState {
  saves: vetypes.SaveMetadata[];
  modules: Readonly<IModuleCache>;
  // TODO: Move to the entry renderer
  loadOrder: { [saveName: string]: string };
  currentlySelectedSaveGame: ISaveGame | undefined;
}

export interface ISaveGame {
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

type IComponentProps = IStateProps & IOwnProps;
type IComponentState = IBaseState;
class SaveList extends ComponentEx<IComponentProps, IComponentState> {
  private mStaticButtons: types.IActionDefinition[];
  private saveGameActions: ITableRowAction[];
  private savesDict: { [name: string]: ISaveGame } = {};
  private tableAttributes: types.ITableAttribute[];

  constructor(props: IComponentProps) {
    super(props);

    const saves: vetypes.SaveMetadata[] = props.launcherManager.getSaveFiles();
    const modules: Readonly<IModuleCache> = props.launcherManager.getModulesVortex();

    // need to init the state so it saves with vortex
    this.initState({
      saves,
      modules,
      loadOrder: {},
      currentlySelectedSaveGame: undefined,
    });

    console.log(this.props);
    console.log(props.context);
    console.log(this.state);

    this.OnRefreshList();

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
        id: 'name',
        name: 'Name',
        calc: (saveGame: ISaveGame) => saveGame.name,
        placement: 'both',
        edit: {},
      },
      {
        id: 'characterName',
        name: 'Character',
        calc: (saveGame: ISaveGame) => saveGame.characterName ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'mainHeroLevel',
        name: 'Level',
        calc: (saveGame: ISaveGame) => saveGame.mainHeroLevel ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'dayLong',
        name: 'Days',
        calc: (saveGame: ISaveGame) => saveGame.dayLong?.toFixed(0) ?? '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'status',
        name: 'Status',
        customRenderer: (saveGame: ISaveGame) => this.GetStatusCustomRenderer(saveGame),
        placement: 'both',
        edit: {},
      },
      {
        id: 'applicationVersion',
        name: 'Version',
        calc: (saveGame: ISaveGame) =>
          saveGame.applicationVersion != undefined ? versionToString(saveGame.applicationVersion) : '',
        placement: 'both',
        edit: {},
      },
      {
        id: 'creationTime',
        name: 'Created',
        calc: (saveGame: ISaveGame) => ticksToDate(saveGame.creationTime)?.toLocaleString(),
        placement: 'both',
        edit: {},
      },
    ];
  }

  public render(): JSX.Element {
    const { t } = this.props;

    const header: JSX.Element = (
      <IconBar group="bannerlord-saves-icons" staticElements={this.mStaticButtons} className="menubar" t={t!} />
    );

    return (
      <MainPage>
        <MainPage.Header>{header}</MainPage.Header>
        <MainPage.Body>{this.renderContent(this.saveGameActions)}</MainPage.Body>
      </MainPage>
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
    const { saves, currentlySelectedSaveGame } = this.state;

    return (
      <Panel>
        <Panel.Body>
          <FlexLayout type="column">
            <FlexLayout.Fixed id="instructions">
              <p>
                Instructions: Choose a save below (which is read from xxx folder in Steam library locaiton?) to launch
                with that save. When it is selected, any issues are displayed on the right.
              </p>
            </FlexLayout.Fixed>

            <FlexLayout type="row">
              <FlexLayout.Flex>
                <Table
                  tableId="bannerlord-savegames"
                  data={this.savesDict}
                  staticElements={this.tableAttributes}
                  actions={saveActions}
                  multiSelect={false}
                  hasActions={false}
                  showDetails={false}
                  onChangeSelection={(ids) => this.OnChangeSelection(ids)}
                />
              </FlexLayout.Flex>

              <FlexLayout.Fixed id="sidebar">{this.RenderSidebar(currentlySelectedSaveGame)}</FlexLayout.Fixed>
            </FlexLayout>
          </FlexLayout>
        </Panel.Body>
      </Panel>
    );
  }

  private OnChangeSelection(ids: string[]) {
    console.log(`BANNERLORD: OnChangeSelection(${ids})`);

    // get current state object
    let { currentlySelectedSaveGame } = this.state;

    const saveGame = this.savesDict[ids[0]];

    //console.log(`BANNERLORD: OnSaveSelected(): previous= saveGame=`);
    //console.log(currentlySelectedSaveGame);
    //console.log(saveGame);
    //console.log(this.state);

    /** so so hacky to get a deselection row added
     * this works by finding the element from the save game name.
     * a save called 'New Save Game' is turned into an id called 'new-save-game_' for the row that can be selected
     * we then detect if we are already clicking something that is selected, and remove the class 'table-selected' from
     * its row, so it looks deselected. we then send an empty string back to the launcherManager and set
     * currentlySelectedSaveGame as undefined to mimic
     */

    // replace defaults to only the first instance, so we need a small inline regex to do globally
    const id = ids[0].replace(/ /g, '-').toLowerCase() + '_';
    const element = document.getElementById(id);
    console.log(element);
    console.log(id);

    if (currentlySelectedSaveGame != undefined) {
      if (saveGame.name == currentlySelectedSaveGame.name) {
        // matches so this is a second click
        console.log(`BANNERLORD: OnSaveSelected(): we've clicked an already selected item. ${saveGame}`);

        if (element != null) {
          console.log(element);
          element.className = element.className.replace(/(?:^|\s)table-selected(?!\S)/g, '');
        }

        this.OnSaveClear();
        return;
      } else {
        // doesn't match so is a new item.
        console.log(`BANNERLORD: OnSaveSelected(): this is a new item that's been clicked. ${saveGame}`);
      }
    } else {
      // no previous selected items
      console.log(`BANNERLORD: OnSaveSelected(): first click of the day. ${saveGame}`);

      if (element != null) {
        console.log(element);
        element.className += ' table-selected';
      }
    }

    this.OnSaveSelected(saveGame);
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
        {this.GetIssueRenderSnippet('Missing Modules:', saveGame.missingModules)}
        {this.GetIssueRenderSnippet('Duplicate Modules:', saveGame.duplicateModules)}
        {this.GetIssueRenderSnippet('Version Mismatches:', saveGame.mismatchedModuleVersions)}
        {this.GetIssueRenderSnippet('Load Order issues:', saveGame.loadOrderIssues)}
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

    // default to returning empty fragment
    return <></>;
  }

  private OnRefreshList() {
    const { launcherManager } = this.props;

    console.log(this.props);

    const saves: vetypes.SaveMetadata[] = launcherManager.getSaveFiles();
    const modules = launcherManager.getModulesVortex();

    // build new ISaveGame from SaveMetadata, just to make it easier to work with

    this.savesDict = saves.reduce((prev: { [name: string]: ISaveGame }, current) => {
      const saveGame: ISaveGame = {
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
    }, {});

    /*
    saves.map((save) => {
      this.savesDict[save.Name] = {
        name: save.Name,
        applicationVersion: BannerlordModuleManager.parseApplicationVersion(save.ApplicationVersion),
        creationTime: save.CreationTime,
        characterName: save.CharacterName,
        mainHeroGold: save.MainHeroGold,
        mainHeroLevel: save.MainHeroLevel,
        dayLong: save.DayLong,

        clanBannerCode: save.ClanBannerCode,
        clanFiefs: save.ClanFiefs,
        clanInfluence: save.ClanInfluence,

        mainPartyFood: save.MainPartyFood,
        mainPartyHealthyMemberCount: save.MainPartyHealthyMemberCount,
        mainPartyPrisonerMemberCount: save.MainPartyPrisonerMemberCount,
        mainPartyWoundedMemberCount: save.MainPartyWoundedMemberCount,
        version: save.Version,
        modules: {}, // blank dictionary for now
      };

      // build up modules dictionary?
      const moduleNames: string[] = save.Modules.split(';');

      for (const module of moduleNames) {
        const key: string = module;
        const value: string = save['Module_' + module];

        // skip this if it's undefined
        if (value == undefined) continue;

        this.savesDict[save.Name].modules[key] = value;
      }
    });*/

    this.setState({
      saves,
      modules,
    });

    console.log(`BANNERLORD: OnRefreshList() this.savesDict= saves=`);
    console.log(this.savesDict);
    console.log(saves);
    console.log(modules);

    // get current state object
    let { currentlySelectedSaveGame } = this.state;
  }

  private OnSaveClear() {
    const { launcherManager } = this.props;

    // get current state object
    let { currentlySelectedSaveGame } = this.state;

    // update it
    currentlySelectedSaveGame = undefined;

    // save it
    this.setState({ currentlySelectedSaveGame });

    // need to send null but empty string will do
    launcherManager.setGameParameterSaveFile('');
  }

  private OnSaveSelected(saveGame: ISaveGame) {
    console.log(`BANNERLORD: OnSaveSelected() modules.length=${Object.keys(saveGame.modules).length} saveGame=`);
    console.log(saveGame);

    const { launcherManager } = this.props;

    // get current state object
    let { currentlySelectedSaveGame } = this.state;

    // update it
    currentlySelectedSaveGame = saveGame;

    // save it
    this.setState({ currentlySelectedSaveGame });

    launcherManager.setGameParameterSaveFile(saveGame.name);
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

    console.log(`BANNERLORD: ValidateSave() saveGame=`);
    console.log(saveGame);

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

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

interface IStateProps {}
type IOwnProps = IItemRendererProps & {
  launcherManager: VortexLauncherManager;
};

interface IBaseState {
  saves: vetypes.SaveMetadata[];
  modules: Readonly<IModuleCache>;
  // TODO: Move to the entry renderer
  loadOrder: { [saveName: string]: string };
  warningHints: { [saveName: string]: string | undefined };
  errorHints: { [saveName: string]: string | undefined };
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
      warningHints: {},
      errorHints: {},
      currentlySelectedSaveGame: undefined,
    });

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
          onClick: this.OnRefreshList,
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
        calc: (saveGame: ISaveGame) => saveGame.creationTime ?? '',
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
    const { warningHints, errorHints } = this.state;

    if (warningHints[saveGame.name] !== undefined) {
      return (
        <tooltip.Icon
          name="feedback-warning"
          tooltip={warningHints[saveGame.name]!}
          style={{ color: `orange`, marginRight: `10` }}
        />
      );
    }

    if (errorHints[saveGame.name] !== undefined) {
      return (
        <tooltip.Icon
          name="feedback-warning"
          tooltip={errorHints[saveGame.name]!}
          style={{ color: `red`, marginRight: `10` }}
        />
      );
    }

    return <tooltip.Icon name="toggle-enabled" tooltip="Good to go!" style={{ color: `green`, marginRight: `10` }} />;
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
                  showDetails={true}
                  onChangeSelection={(ids) => {
                    this.OnSaveSelected(this.savesDict[ids[0]]);
                    console.log(`BANNERLORD: onChangeSelection(${ids})`);
                  }}
                />
              </FlexLayout.Flex>

              <FlexLayout.Fixed id="sidebar">{this.RenderSidebar(currentlySelectedSaveGame)}</FlexLayout.Fixed>
            </FlexLayout>
          </FlexLayout>
        </Panel.Body>
      </Panel>
    );
  }

  private RenderSidebar(saveGame: ISaveGame | undefined): JSX.Element {
    if (saveGame == undefined) {
      return <h3>Choose a save game</h3>;
    } else {
    }
    return (
      <>
        <h3>{saveGame?.name}</h3>
        <p>Instructions:</p>
        <p>Something</p>
        <p>Modules:</p>
        <ul>
          <li>One</li>
          <li>Two</li>
          <li>Three</li>
          <li>Four</li>
        </ul>
      </>
    );
  }

  private OnRefreshList() {
    const { launcherManager } = this.props;

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
  }

  private OnSaveSelected(saveGame: ISaveGame) {
    const { launcherManager } = this.props;

    // get current state object
    let { currentlySelectedSaveGame } = this.state;

    // update it
    currentlySelectedSaveGame = saveGame;

    // save it
    this.setState({ currentlySelectedSaveGame });

    console.log('BANNERLORD: OnSaveSelected(): saveGame=');
    console.log(saveGame);
    console.log(this.state);

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
    const { warningHints, errorHints } = this.state;

    warningHints[saveGame.name] = undefined;
    errorHints[saveGame.name] = undefined;

    const availableModules = launcherManager.getModulesVortex();

    const nameDuplicates = getNameDuplicatesError(saveGame, launcherManager, availableModules);
    if (nameDuplicates !== undefined) {
      errorHints[saveGame.name] = launcherManager.localize('{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}', {
        MODULENAMES: Object.values(nameDuplicates).join('\n'),
      });
      this.setState({ errorHints });
      return;
    }

    const loadOrderIssues = getLoadOrderIssues(saveGame, launcherManager, availableModules);
    const missingModules = getMissingModuleNamesError(saveGame, launcherManager, availableModules);
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
    }

    const mismatchedModuleVersions = getMismatchedModuleVersionsWarning(saveGame, launcherManager, availableModules);
    if (mismatchedModuleVersions !== undefined) {
      warningHints[saveGame.name] = launcherManager.localize(
        '{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}',
        {
          MODULEVERSIONS: mismatchedModuleVersions,
        }
      );
      this.setState({ warningHints });
    }
  }
}

export default SaveList;

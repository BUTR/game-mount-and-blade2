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
import semver from 'semver';
import { ApplicationVersion } from '@butr/vortexextensionnative/dist/main/lib/types';
import { versionToString } from '../../utils/util';

interface IStateProps {}
type IOwnProps = IItemRendererProps & {
  launcherManager: VortexLauncherManager;
};

interface IBaseState {
  saves: vetypes.SaveMetadata[];
  modules: Readonly<IModuleCache>;
}

interface ISaveGame {
  name: string;
  applicationVersion?: string;
  creationTime?: string;
  characterName?: string;
  mainHeroGold?: string;
  mainHeroLevel?: string;
  dayLong?: string;
  clanBannerCode?: string;
  clanFiefs?: string;
  clanInfluence?: string;
  mainPartyFood?: string;
  mainPartyHealthyMemberCount?: string;
  mainPartyPrisonerMemberCount?: string;
  mainPartyWoundedMemberCount?: string;
  version?: string; // always a 1?
  modules: { [name: string]: string }; // key value pair - name of module : version of module
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
        calc: (saveGame: ISaveGame) => saveGame.characterName,
        placement: 'both',
        edit: {},
      },
      {
        id: 'mainHeroLevel',
        name: 'Levels',
        calc: (saveGame: ISaveGame) => saveGame.mainHeroLevel,
        placement: 'both',
        edit: {},
      },
      {
        id: 'dayLong',
        name: 'Days',
        calc: (saveGame: ISaveGame) => (saveGame.dayLong != undefined ? parseInt(saveGame.dayLong) : ''),
        placement: 'both',
        edit: {},
      },
      {
        id: 'status',
        name: 'Status',
        customRenderer: (saveGame: ISaveGame) => (
          <tooltip.Icon
            name="feedback-warning"
            tooltip={'some tooltip text?' + saveGame.name}
            style={{ color: `orange`, marginRight: `10` }}
          />
        ),
        placement: 'both',
        edit: {},
      },
      {
        id: 'applicationVersion',
        name: 'Version',
        calc: (saveGame: ISaveGame) => saveGame.applicationVersion,
        placement: 'both',
        edit: {},
      },
      {
        id: 'creationTime',
        name: 'Created At',
        calc: (saveGame: ISaveGame) => saveGame.creationTime,
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

  private renderContent(saveActions: ITableRowAction[]) {
    const { saves } = this.state;

    return (
      <Panel>
        <Panel.Body>
          <FlexLayout type="column">
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

            <FlexLayout.Fixed>
              <div
                style={{
                  backgroundColor: `var(--brand-bg, black)`,
                  padding: '10px',
                  border: `2px solid var(--border-color, white)`,
                }}
              >
                Something?
              </div>
            </FlexLayout.Fixed>
          </FlexLayout>
        </Panel.Body>
      </Panel>
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
        applicationVersion: current.ApplicationVersion,
        creationTime: current.CreationTime,
        characterName: current.CharacterName,
        mainHeroGold: current.MainHeroGold,
        mainHeroLevel: current.MainHeroLevel,
        dayLong: current.DayLong,

        clanBannerCode: current.ClanBannerCode,
        clanFiefs: current.ClanFiefs,
        clanInfluence: current.ClanInfluence,

        mainPartyFood: current.MainPartyFood,
        mainPartyHealthyMemberCount: current.MainPartyHealthyMemberCount,
        mainPartyPrisonerMemberCount: current.MainPartyPrisonerMemberCount,
        mainPartyWoundedMemberCount: current.MainPartyWoundedMemberCount,
        version: current.Version,
        modules: {}, // blank dictionary for now
      };

      // build up modules dictionary?
      const moduleNames: string[] = current.Modules.split(';');

      for (const module of moduleNames) {
        const key: string = module;
        const value: string = current['Module_' + module];

        // skip this if it's undefined
        if (value == undefined) continue;

        saveGame.modules[key] = value;
      }

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

    console.log('BANNERLORD: OnSaveSelected(): saveGame=');
    console.log(saveGame);
    launcherManager.setGameParameterSaveFile(saveGame.name);
  }
}

export default SaveList;

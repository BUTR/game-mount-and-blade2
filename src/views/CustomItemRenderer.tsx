import { withTranslation } from "react-i18next";
import { ComponentEx, actions, FlexLayout, tooltip, selectors, util, types } from "vortex-api";
import path from 'path';
import { getValidationInfo } from '../subModCache';
import * as React from 'react';
import { Dispatch } from 'redux';
import * as BS from 'react-bootstrap';
import { connect } from 'react-redux';
import { IItemRendererProps, ILoadOrderEntry } from "../types";

interface IStateProps {
  profile: types.IProfile;
  modsPath: string;
  installPath: string;
  mods: { [key: string]: types.IMod };
  order: types.LoadOrder[];
}
interface IDispatchProps {
  onSetLoadOrderEntry: (profileId: string, modId: string, entry: ILoadOrderEntry<any>) => void;
  onSetDeploymentRequired: () => void;
}
interface IOwnProps extends IItemRendererProps {

}

interface IBaseState {
  offset: { x: number, y: number };
}

const TWLOGO = path.join(__dirname, 'TWLogo.png');
const NAMESPACE: string = 'mnb2-customrenderer';

type IComponentProps = IStateProps & IDispatchProps & IOwnProps;
type IComponentState = IBaseState;
class CustomItemRenderer extends ComponentEx<IComponentProps, IComponentState> {
  constructor(props: IComponentProps) {
    super(props);
    this.state = {
      offset: { x: 0, y: 0 },
    }

    this.renderAddendum = this.renderAddendum.bind(this);
    this.renderInvalidEntry = this.renderInvalidEntry.bind(this);
    this.renderEntry = this.renderEntry.bind(this);
    this.renderOpenDirButton = this.renderOpenDirButton.bind(this);
    this.renderIncompatibleIcon = this.renderIncompatibleIcon.bind(this);
  }

  renderAddendum(): JSX.Element {
    const { item } = this.props;

    const renderExternalIcon = () => this.isExternal(item.id)
      ? <tooltip.Icon name='dialog-info' tooltip={'Not managed by Vortex'} />
      : null;

    const renderInfo = () => {
      return (
      <React.Fragment>
        {renderExternalIcon()}
        {this.renderIncompatibleIcon(item)}
      </React.Fragment>
      );
    }

    return (this.isItemInvalid(item))
      ? this.renderOpenDirButton()
      : renderInfo();
  }

  // TODO: move all style configuration into a stylesheet
  renderOfficialEntry(item: types.ILoadOrderDisplayItem): JSX.Element {
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img
          src={TWLOGO}
          className='official-submodule-logo'
          style={{
            width:'1.5em',
            height:'1.5em',
            marginRight:'5px',
          }}
         />
         <p>{item.name}</p>
      </div>
    );
  }

  renderEntry(item: types.ILoadOrderDisplayItem): JSX.Element {
    const { order } = this.props;
    return (
      <BS.Checkbox 
        checked={order[item.id].enabled}
        disabled={false}
        onChange={this.onStatusChange}
      >
        {item.name}
      </BS.Checkbox>
    );
  }

  renderInvalidEntry(item: types.ILoadOrderDisplayItem): JSX.Element {
    const invalidReason = this.itemInvalidReason(item);
    return (
      <BS.Checkbox checked={false} disabled={true} >
        {invalidReason 
          ? <tooltip.Icon style={{color: 'red'}} name='feedback-error' tooltip={invalidReason} /> 
          : null}
      </BS.Checkbox>
    );
  }

  renderResult(item: types.ILoadOrderDisplayItem): JSX.Element {
    if (this.isItemInvalid(item)) return this.renderInvalidEntry(item);
    else if (item.official) return this.renderOfficialEntry(item);
    else return this.renderEntry(item);
  }

  render() {
    const { order, className, item } = this.props;
    const position = (!item.prefix) ? item.prefix : order[item.id].pos + 1;

    let classes = ['load-order-entry'];
    if (className !== undefined) {
      classes = classes.concat(className.split(' '));
    }

    return (
      <BS.ListGroupItem
        className='load-order-entry'
        ref={this.setRef}
        key={`${item.name}-${position}`}
        style={{height: '48px'}}
      >
      <FlexLayout type='row'>
        <FlexLayout.Flex 
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            height: '20px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {this.renderResult(item) }        
        </FlexLayout.Flex>
        <FlexLayout.Flex
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          {this.renderAddendum()}
        </FlexLayout.Flex>
      </FlexLayout>
      </BS.ListGroupItem>
    );
  }

  isItemInvalid(item: types.ILoadOrderDisplayItem): boolean {
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);
    return (infoObj.missing.length > 0);
  }

  getItemIncompatibilities(item: types.ILoadOrderDisplayItem) {
    if (item.official === true) {
      return [];
    }
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);
    return infoObj?.incompatible || [];
  }

  itemInvalidReason(item: types.ILoadOrderDisplayItem): string | undefined {
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);
    if (infoObj.missing.length > 0) {
      // This mod is missing a dependency, that's
      //  somewhat more pressing at the moment.
      return `Missing dependencies: ${infoObj.missing.join(';')}`;
    }
    return undefined;
  }

  renderIncompatibleIcon(item: types.ILoadOrderDisplayItem): JSX.Element {
    const incomp = this.getItemIncompatibilities(item)
      .map(inst => `Requires ${inst.id} (${inst.requiredVersion}) - but - (${inst.currentVersion}) is installed`);

    return (incomp.length > 0)
      ? <tooltip.Icon name='feedback-warning' tooltip={incomp.join('\n')} style={{color: 'yellow'}} />
      : null;
  }

  renderOpenDirButton(): JSX.Element {
    const { item, mods, modsPath, installPath } = this.props;
    const managedModKeys = Object.keys(mods);
    const itemPath = managedModKeys.includes(item.id)
      ? path.join(installPath, mods[item.id].installationPath)
      : path.join(modsPath, 'Modules', item.id);
    return (
      <tooltip.IconButton
        icon='open-ext'
        tooltip={'Open path'}
        className='btn-embed btn-dismiss'
        onClick={() => util.opn(itemPath).catch(() => null)}
      />
    );
  }

  onStatusChange = (evt: any): void => {
    const { profile, order, item, onSetLoadOrderEntry } = this.props;
    const entry: ILoadOrderEntry<any> = {
      pos: order[item.id].pos,
      enabled: evt.target.checked,
      locked: false,
    }

    onSetLoadOrderEntry(profile.id, item.id, entry);
  }

  isExternal = (subModId: string): boolean => {
    const { mods } = this.props;
    const modIds = Object.keys(mods);
    if (modIds.includes(subModId)) {
      return false;
    }

    const id = modIds.find(modId => {
      const subModIds = util.getSafe(mods[modId], ['attributes', 'subModIds'], []);
      return (subModIds.includes(subModId)) ? true : false;
    });
    return (id === undefined);
  }

  setRef = (ref: any): any => {
    return this.props.onRef(ref);
  }
}

function mapState(state: types.IState): IStateProps {
  const profile: types.IProfile = selectors.activeProfile(state);
  const game: types.IGame = util.getGame(profile.gameId);
  const discovery: types.IDiscoveryResult = selectors.discoveryByGame(state, profile.gameId);
  const modsPath: string = game.getModPaths(discovery.path)[''];
  const installPath: string = selectors.installPathForGame(state, profile.gameId);
  return {
    profile,
    modsPath,
    installPath,
    mods: util.getSafe(state, ['persistent', 'mods', profile.gameId], {}),
    order: util.getSafe(state, ['persistent', 'loadOrder', profile.id], []),
  };
};
function mapDispatch(dispatch: Dispatch): IDispatchProps {
  return {
    onSetLoadOrderEntry: (profileId, modId, entry) =>
      dispatch(actions.setLoadOrderEntry(profileId, modId, entry)),
    onSetDeploymentRequired: () =>
      dispatch(actions.setDeploymentNecessary('mountandblade2bannerlord', true)),
  };
};

;

export default
  withTranslation(['common', NAMESPACE])
  (connect<IStateProps, IDispatchProps, IOwnProps>(mapState, mapDispatch)(CustomItemRenderer));
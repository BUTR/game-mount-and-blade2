import { withTranslation } from "react-i18next";
import { ComponentEx } from "vortex-api";
import { IExtendedInterfaceProps } from "./collections/types";

const React = require('react');
const BS = require('react-bootstrap');
const { connect } = require('react-redux');
const path = require('path');
const { actions, FlexLayout, tooltip, selectors, util } = require('vortex-api');

const { getValidationInfo } = require('./subModCache');

const TWLOGO = path.join(__dirname, 'TWLogo.png');

const NAMESPACE: string = 'mnb2-customrenderer';

interface IBaseState {
  offset: { x: number, y: number };
}

interface IConnectedProps {
  //gameId: string;
  //mods: { [modId: string]: types.IMod };
  //loadOrder: ILoadOrder;
  //profile: types.IProfile;
  item: any;
  order: any;
  className: any;
  moduleManager: any;
  mods: any;
  modsPath: any;
  installPath: any;
  profile: any;
  onSetLoadOrderEntry: any;
  onRef: (ref: any) => any;
}

interface IActionProps {

}

type IProps = IActionProps & IExtendedInterfaceProps & IConnectedProps;
type IComponentState = IBaseState;

class CustomItemRenderer extends ComponentEx<IProps, IComponentState> {
  mMounted: boolean;

  constructor(props) {
    super(props);
    this.state = {
      offset: { x: 0, y: 0 },
    }
    this.mMounted = false;

    this.renderAddendum = this.renderAddendum.bind(this);
    this.renderInvalidEntry = this.renderInvalidEntry.bind(this);
    this.renderEntry = this.renderEntry.bind(this);
    this.renderOpenDirButton = this.renderOpenDirButton.bind(this);
    this.renderIncompatibleIcon = this.renderIncompatibleIcon.bind(this);
  }

  componentDidMount() {
    this.mMounted = true;
  }

  componentWillUnmount() {
    this.mMounted = false;
  }

  renderAddendum() {
    // Extra stuff we want to add to the LO entry.
    //  Currently renders the open directory button for
    const { item, order } = this.props;

    const renderExternalIcon = () => this.isExternal(item.id)
      ? React.createElement(tooltip.Icon, { name: 'dialog-info', tooltip: 'Not managed by Vortex' })
      : null;

    const renderInfo = () => {
      return React.createElement(React.Fragment, {},
        renderExternalIcon(),
        this.renderIncompatibleIcon(item),
      );
    }

    return (this.isItemInvalid(item))
      ? this.renderOpenDirButton()
      : renderInfo();
  }

  // TODO: move all style configuration into a stylesheet
  renderOfficialEntry(item) {
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center' } }, 
      React.createElement('img', {
      src: TWLOGO,
      className: 'official-submodule-logo',
      style: {
        width:'1.5em',
        height:'1.5em',
        marginRight:'5px',
      },
    }),
    React.createElement('p', {}, item.name));
  }

  renderEntry(item) {
    const { order } = this.props;
    return React.createElement(BS.Checkbox, {
      checked: order[item.id].enabled,
      disabled: false,
      onChange: this.onStatusChange
    }, item.name);
  }

  renderInvalidEntry(item) {
    const invalidReason = this.itemInvalidReason(item);
    const reasonElement = () => (invalidReason !== undefined) 
      ? React.createElement(tooltip.Icon, { style: {color: 'red'}, name: 'feedback-error', tooltip: invalidReason })
      : null;
    return React.createElement(BS.Checkbox, {
      checked: false,
      disabled: true }, item.name, ' ', reasonElement());
  }

  render() {
    const { order, className, item } = this.props;
    const position = (item.prefix !== undefined)
      ? item.prefix
      : order[item.id].pos + 1;

    let classes = ['load-order-entry'];
    if (className !== undefined) {
      classes = classes.concat(className.split(' '));
    }

    const key = `${item.name}-${position}`;
    const result = React.createElement(BS.ListGroupItem, {
      className: 'load-order-entry',
      ref: this.setRef,
      key,
      style: { height: '48px' },
    },
    React.createElement(FlexLayout, { type: 'row', height: '20px' },
      React.createElement(FlexLayout.Flex, {
        style: {
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          height: '20px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }
      }, (this.isItemInvalid(item))
        ? this.renderInvalidEntry(item)
        : (item.official)
          ? this.renderOfficialEntry(item)
          : this.renderEntry(item)
        ),
      React.createElement(FlexLayout.Flex, {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
        }
      }, this.renderAddendum())));
    return result;
  }

  isIncompabile(item) {
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);
    return (infoObj.incompatibleDeps.length > 0);
  }

  isItemInvalid(item) {
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);
    return (infoObj.missing.length > 0);
  }

  getItemIncompatibilities(item) {
    if (item.official === true) {
      return [];
    }
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);
    return infoObj?.incompatible || [];
  }

  itemInvalidReason(item) {
    const infoObj = getValidationInfo(this.props.moduleManager, item.id);

    if (infoObj.missing.length > 0) {
      // This mod is missing a dependency, that's
      //  somewhat more pressing at the moment.
      return `Missing dependencies: ${infoObj.missing.join(';')}`;
    }

    return undefined;
  }

  renderIncompatibleIcon(item) {
    const incomp = this.getItemIncompatibilities(item)
      .map(inst => `Requires ${inst.id} (${inst.requiredVersion}) - but - (${inst.currentVersion}) is installed`);

    return (incomp.length > 0)
      ? React.createElement(tooltip.Icon, {
          style: {
            color: 'yellow',
          },
          name: 'feedback-warning',
          tooltip: incomp.join('\n')})
      : null;
  }

  renderOpenDirButton() {
    const { item, mods, modsPath, installPath } = this.props;
    const managedModKeys = Object.keys(mods);
    const itemPath = managedModKeys.includes(item.id)
      ? path.join(installPath, mods[item.id].installationPath)
      : path.join(modsPath, 'Modules', item.id);
    return React.createElement(tooltip.IconButton, {
      icon: 'open-ext',
      tooltip: 'Open path',
      className: 'btn-embed btn-dismiss',
      onClick: () => util.opn(itemPath).catch(err => null) });
  }

  onStatusChange = (evt) => {
    const { profile, order, item, onSetLoadOrderEntry } = this.props;
    const entry = {
      pos: order[item.id].pos,
      enabled: evt.target.checked,
      locked: false,
    }

    onSetLoadOrderEntry(profile.id, item.id, entry);
  }

  isExternal = (subModId) => {
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

  setRef = (ref) => {
    return this.props.onRef(ref);
  }
}

function mapStateToProps(state) {
  const profile = selectors.activeProfile(state);
  const game = util.getGame(profile.gameId);
  const discovery = selectors.discoveryByGame(state, profile.gameId);
  const modsPath = game.getModPaths(discovery.path)[''];
  const installPath = selectors.installPathForGame(state, profile.gameId);
  return {
    profile,
    modsPath,
    installPath,
    mods: util.getSafe(state, ['persistent', 'mods', profile.gameId], {}),
    order: util.getSafe(state, ['persistent', 'loadOrder', profile.id], []),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    onSetLoadOrderEntry: (profileId, modId, entry) =>
      dispatch(actions.setLoadOrderEntry(profileId, modId, entry)),
    onSetDeploymentRequired: () =>
      dispatch(actions.setDeploymentNecessary('mountandblade2bannerlord', true)),
  };
}

export default withTranslation(['common', NAMESPACE])(
  connect(mapStateToProps, mapDispatchToProps)(CustomItemRenderer) as any);
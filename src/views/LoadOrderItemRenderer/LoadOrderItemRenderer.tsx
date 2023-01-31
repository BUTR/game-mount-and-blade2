import * as React from 'react';
import * as BS from 'react-bootstrap';
import { withTranslation } from "react-i18next";
import { connect } from 'react-redux';
import { Dispatch } from 'redux';
import { ComponentEx, actions, FlexLayout, selectors, util, types } from "vortex-api";
import { ILoadOrder } from 'vortex-api/lib/extensions/mod_load_order/types/types';
import { types as vetypes } from '@butr/vortexextensionnative';
import { IItemRendererProps, IMods } from "../../types";

import { IconNonVortex } from './IconNonVortex';
import { IconIssues } from './IconIssues';
import { IconDependencies } from './IconDependencies';
import { ItemOfficialModule } from './ItemOfficialModule';
import { ItemValidModule } from './ItemValidModule';
import { ButtonOpenDir } from './ButtonOpenDir';
import { getModuleIssues } from '../../utils/subModCache';
import { GAME_ID } from '../../common';

const NAMESPACE = `mnb2-customrenderer`;

interface IStateProps {
  profile: types.IProfile;
  modsPath: string;
  installPath: string;
  mods: IMods;
  order: ILoadOrder;
}
interface IDispatchProps {
  onSetLoadOrderEntry: (profileId: string, modId: string, entry: types.ILoadOrderEntry) => void;
  onSetDeploymentRequired: () => void;
}
type IOwnProps = IItemRendererProps & {
  manager: vetypes.VortexExtensionManager
};

interface IBaseState {
  offset: { x: number, y: number };
  issues: vetypes.ModuleIssue[];
}

type IComponentProps = IStateProps & IDispatchProps & IOwnProps;
type IComponentState = IBaseState;
class LoadOrderItemRenderer extends ComponentEx<IComponentProps, IComponentState> {
  constructor(props: IComponentProps) {
    super(props);
    this.state = {
      offset: { x: 0, y: 0 },
      issues: getModuleIssues(props.item.id),
    };

    //this.onStatusChange = this.onStatusChange.bind(this);
    this.renderAddendum = this.renderAddendum.bind(this);
    this.renderItem = this.renderItem.bind(this);
  }

  onStatusChange(evt: any, item: types.ILoadOrderDisplayItem): void {
    const { profile, order, onSetLoadOrderEntry } = this.props;
    
    const index = Array.isArray(order) ? order.indexOf(item.id) : -1;
    const entry: types.ILoadOrderEntry & { pos: number} = {
      pos: index,
      id: item.id,
      name: item.name,
      enabled: evt.target.checked,
      locked: false,
    };

    onSetLoadOrderEntry(profile.id, item.id, entry);
  };

  renderItem(item: types.ILoadOrderDisplayItem): JSX.Element {
    const { order } = this.props;
    const { issues } = this.state;
  
    if (item.official) {
      return ItemOfficialModule({ item: item, order, onStatusChange: this.onStatusChange, issues: issues });
    }

    return ItemValidModule({ item: item, order, onStatusChange: this.onStatusChange, issues: issues });
  };

  renderAddendum(): JSX.Element {
    const { item, mods, modsPath, installPath } = this.props;
    const { issues } = this.state;

    return (
      <React.Fragment>
        {IconIssues({ item: item, issues: issues })}
        {IconDependencies({ item: item })}
        {IconNonVortex({ item: item, mods: mods })}
        {ButtonOpenDir({ item: item, mods: mods, modsPath: modsPath, installPath: installPath })}
      </React.Fragment>
    );
  };

  render(): JSX.Element {
    const { order, className, item, onRef } = this.props;
    const position = (!item.prefix) ? item.prefix : order[item.id].pos + 1;

    let classes = [`load-order-entry`];
    if (className !== undefined) {
      classes = classes.concat(className.split(` `));
    }

    return (
      <BS.ListGroupItem
        className='load-order-entry'
        ref={onRef}
        key={`${item.name}-${position}`}
        style={{ height: `48px` }}
      >
        <FlexLayout type='row'>
          {/* TODO: How to FlexLayout.Flex? */}
          <div
            style={{
              display: `flex`,
              justifyContent: `stretch`,
              height: `20px`,
              overflow: `hidden`,
              whiteSpace: `nowrap`,
              textOverflow: `ellipsis`,
            }}
          >
            {this.renderItem(item) }
          </div>
          <FlexLayout.Flex
            style={{
              display: `flex`,
              justifyContent: `flex-end`,
              minWidth: 0,
            }}
          >
            {this.renderAddendum()}
          </FlexLayout.Flex>
        </FlexLayout>
      </BS.ListGroupItem>
    );
  };

}

const mapState = (state: types.IState, ownProps: IOwnProps): IStateProps => {
  const profile = selectors.activeProfile(state);
  const game = util.getGame(profile.gameId);
  const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(state, profile.gameId);
  const modsPath = game.getModPaths && discovery?.path ? game.getModPaths(discovery.path)[``] : ``;
  const installPath: string = selectors.installPathForGame(state, profile.gameId);
  return {
    profile,
    modsPath,
    installPath,
    mods: util.getSafe<IMods>(state, [`persistent`, `mods`, profile.gameId], {}),
    order: ownProps.manager.getLoadOrder(),
  };
};
const mapDispatch = (dispatch: Dispatch, _ownProps: IOwnProps): IDispatchProps => ({
  onSetLoadOrderEntry: (profileId, modId, entry) => dispatch(actions.setLoadOrderEntry(profileId, modId, entry)),
  onSetDeploymentRequired: () => dispatch(actions.setDeploymentNecessary(GAME_ID, true)),
});

export default withTranslation([`common`, NAMESPACE])(connect(mapState, mapDispatch)(LoadOrderItemRenderer));

import Bluebird, { Promise, method as toBluebird } from 'bluebird';

import _ from 'lodash';
import * as React from 'react';
import { Button, ListGroup, ListGroupItem } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import {
  ComponentEx, EmptyPlaceholder, FlexLayout, selectors, types, Icon, util,
} from 'vortex-api';

import { Dispatch } from 'redux';
import { IExtendedInterfaceProps } from "collections/src/types/IExtendedInterfaceProps";
import { genCollectionLoadOrder } from '../collections/collectionUtil';
import { ILoadOrder, IMods } from '../types';

const NAMESPACE = `mnb2-collections-data`;

interface IStateProps {
  gameId: string;
  mods: IMods;
  loadOrder: ILoadOrder;
  profile: types.IProfile;
}
interface IDispatchProps {

}
interface IOwnProps {

}

interface IBaseState {
  sortedMods: ILoadOrder;
}

type IComponentProps = IStateProps & IDispatchProps & IOwnProps & IExtendedInterfaceProps;
type IComponentState = IBaseState;
class CollectionsDataView extends ComponentEx<IComponentProps, IComponentState> {
  constructor(props: IComponentProps) {
    super(props);
    const { loadOrder, mods, collection } = props;
    this.initState({
      sortedMods: genCollectionLoadOrder(loadOrder, mods, collection) || {},
    });
  }

  public componentDidMount(): void {
    const { loadOrder, mods, collection } = this.props;
    this.nextState.sortedMods = genCollectionLoadOrder(loadOrder, mods, collection);
  }

  public render(): JSX.Element {
    const { t } = this.props;
    const { sortedMods } = this.state;
    return (!!sortedMods && Object.keys(sortedMods).length !== 0)
      ? (
        <div style={{ overflow: `auto` }}>
          <h4>{t(`Load Order`)}</h4>
          <p>
            {t(`This is a snapshot of the load order information that ` +
           `will be exported with this collection.`)}
          </p>
          {this.renderLoadOrderEditInfo()}
          <ListGroup id='collections-load-order-list'>
            {Object.keys(sortedMods).map(this.renderModEntry)}
          </ListGroup>
        </div>
      ) : this.renderPlaceholder();
  }

  private renderLoadOrderEditInfo = (): JSX.Element => {
    const { t } = this.props;
    return (
      <FlexLayout type='row' id='collection-edit-loadorder-edit-info-container'>
        <FlexLayout.Fixed className='loadorder-edit-info-icon'>
          <Icon name='dialog-info'/>
        </FlexLayout.Fixed>
        <FlexLayout.Fixed className='collection-edit-loadorder-edit-info'>
          {t(`You can make changes to this data from the `)}
          <a
            className='fake-link'
            onClick={this.openLoadOrderPage}
            title={t(`Go to Load Order Page`)}
          >
            {t(`Load Order page.`)}
          </a>
          {t(` If you believe a load order entry is missing, please ensure the ` +
          `relevant mod is enabled and has been added to the collection.`)}
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  };

  private openLoadOrderPage = (): void => {
    this.context.api.events.emit(`show-main-page`, `generic-loadorder`);
  };

  private renderOpenLOButton = (): JSX.Element => {
    const { t } = this.props;
    return (<Button
      id='btn-more-mods'
      className='collection-add-mods-btn'
      onClick={this.openLoadOrderPage}
      bsStyle='ghost'
    >
      {t(`Open Load Order Page`)}
    </Button>);
  };

  private renderPlaceholder = (): JSX.Element => {
    const { t } = this.props;
    return (
      <EmptyPlaceholder
        icon='sort-none'
        text={t(`You have no load order entries (for the current mods in the collection)`)}
        subtext={this.renderOpenLOButton()}
      />
    );
  };

  private renderModEntry = (modId: string): JSX.Element => {
    const loEntry = this.state.sortedMods[modId];
    const key = modId + JSON.stringify(loEntry);
    const name = util.renderModName(this.props.mods[modId]) || modId;
    const classes = [`load-order-entry`, `collection-tab`];
    return (
      <ListGroupItem
        key={key}
        className={classes.join(` `)}
      >
        <FlexLayout type='row'>
          <p className='load-order-index'>{loEntry.pos}</p>
          <p>{name}</p>
        </FlexLayout>
      </ListGroupItem>
    );
  };
}

const mapState = (state: types.IState, _ownProps: IOwnProps): IStateProps => {
  const profile = selectors.activeProfile(state) || undefined;
  let loadOrder: ILoadOrder = {};
  if (profile?.gameId) {
    loadOrder = util.getSafe<ILoadOrder>(state, [`persistent`, `loadOrder`, profile.id], {});
  }

  return {
    gameId: profile?.gameId,
    loadOrder,
    mods: util.getSafe<IMods>(state, [`persistent`, `mods`, profile.gameId], {}),
    profile,
  };
};

const mapDispatch = (_dispatch: Dispatch): IDispatchProps => ({});

export default withTranslation([`common`, NAMESPACE])(connect(mapState, mapDispatch)(CollectionsDataView));

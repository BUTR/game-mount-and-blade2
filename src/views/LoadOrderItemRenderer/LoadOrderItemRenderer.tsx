// import * as React from 'react';
// import * as BS from 'react-bootstrap';
// import { connect } from 'react-redux';
// import { ComponentEx, FlexLayout, selectors, util, types } from "vortex-api";
// import { types as vetypes } from '@butr/vortexextensionnative';
// import { IItemRendererProps, VortexViewModel, ModsStorage, VortexLoadOrderEntry } from "../../types";

// import { IconNonVortex } from './IconNonVortex';
// import { IconIssues } from './IconIssues';
// import { IconDependencies } from './IconDependencies';
// import { ItemOfficialModule } from './ItemOfficialModule';
// import { ItemValidModule } from './ItemValidModule';
// import { ButtonOpenDir } from './ButtonOpenDir';
// import { VortexLauncherManager } from '../../utils/VortexLauncherManager';

// interface IStateProps {
//   profile: types.IProfile;
//   modsPath: string;
//   installPath: string;
//   mods: ModsStorage;
// };
// type IOwnProps = IItemRendererProps & {
//   launcherManager: VortexLauncherManager;
// };

// interface IBaseState {
//   offset: { x: number, y: number };
//   issues: vetypes.ModuleIssue[];
// };

// type IComponentProps = IStateProps & IOwnProps;
// type IComponentState = IBaseState;
// export const LoadOrderItemRenderer = (props: IOwnProps): JSX.Element => {
//   const { offset, issues } = React.useState({ x: 0, y: 0 });
// };) {
//   constructor(props: IComponentProps) {
//     super(props);
//     this.state = {
//       offset: { x: 0, y: 0 },
//       issues: props.launcherManager.getModuleIssues(props.item.id),
//     };
//   }

//   onStatusChange = (evt: any): void => {
//     const { profile, item, launcherManager } = this.props;
    
//     const entry: VortexLoadOrderEntry = {
//       pos: item.index,
//       enabled: evt.target.checked,
//       locked: false,
//       data: {
//         id: item.id,
//         name: item.name,
//         isSelected: evt.target.checked,
//         index: item.index
//       }
//     };

//     launcherManager.setLoadOrderEntry(profile.id, item.id, entry);
//   };

//   renderItem = (item: VortexViewModel): JSX.Element => { 
//     if (item.official) {
//       return ItemOfficialModule({ item: item, onStatusChange: this.onStatusChange });
//     }

//     return ItemValidModule({ item: item, onStatusChange: this.onStatusChange });
//   };

//   renderAddendum = (): JSX.Element => {
//     const { item, mods, modsPath, installPath } = this.props;
//     const { issues } = this.state;

//     return (
//       <React.Fragment>
//         {IconIssues({ item: item, issues: issues })}
//         {IconDependencies({ item: item })}
//         {IconNonVortex({ item: item })}
//         {ButtonOpenDir({ item: item, mods: mods, modsPath: modsPath, installPath: installPath })}
//       </React.Fragment>
//     );
//   };

//   render = (): JSX.Element => {
//     const { className, item, onRef } = this.props;
//     const position = (!item.prefix) ? item.prefix : item.index + 1;

//     let classes = [`load-order-entry`];
//     if (className !== undefined) {
//       classes = classes.concat(className.split(` `));
//     }

//     return (
//       <BS.ListGroupItem
//         className='load-order-entry'
//         ref={onRef}
//         key={`${item.name}-${position}`}
//         style={{ height: `48px` }}
//       >
//         <FlexLayout type='row'>
//           {/* TODO: How to FlexLayout.Flex? */}
//           <div
//             style={{
//               display: `flex`,
//               justifyContent: `stretch`,
//               height: `20px`,
//               overflow: `hidden`,
//               whiteSpace: `nowrap`,
//               textOverflow: `ellipsis`,
//             }}
//           >
//             {this.renderItem(item) }
//           </div>
//           <FlexLayout.Flex
//             style={{
//               display: `flex`,
//               justifyContent: `flex-end`,
//               minWidth: 0,
//             }}
//           >
//             {this.renderAddendum()}
//           </FlexLayout.Flex>
//         </FlexLayout>
//       </BS.ListGroupItem>
//     );
//   };

// }

// const mapState = (state: types.IState, _ownProps: IOwnProps): IStateProps => {
//   const profile = selectors.activeProfile(state);
//   const game = util.getGame(profile.gameId);
//   const discovery: types.IDiscoveryResult | undefined = selectors.discoveryByGame(state, profile.gameId);
//   const modsPath = game.getModPaths && discovery?.path ? game.getModPaths(discovery.path)[``] : ``;
//   const installPath: string = selectors.installPathForGame(state, profile.gameId);
//   return {
//     profile,
//     modsPath,
//     installPath,
//     mods: util.getSafe<ModsStorage>(state, [`persistent`, `mods`, profile.gameId], {}),
//   };
// };

// export default connect(mapState)(LoadOrderItemRenderer);

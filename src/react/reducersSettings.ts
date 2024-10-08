import { actions, types, util } from 'vortex-api';
import { Utils } from '@butr/vortexextensionnative';
import { createReducer, ReducerHandler, ReducerHandlerState } from './redux';
import { nameof as nameof2 } from '../nameof';
import { actionsSave, SetCurrentSavePayload } from '../save';
import {
  actionsSettings,
  IBannerlordSettings,
  SetBetaSortingPayload,
  SetFixCommonIssuesPayload,
  SetSortOnDeployPayload,
} from '../settings';
import { i18nToBannerlord } from '../localization';

// TODO: Ask IDCs to provider a proper type system?
type SetLoadOrderPayload = {
  id: string;
  order: unknown[];
};

type SetLanguagePayload = string;

const nameof = nameof2<IBannerlordSettings>;

const setSortOnDeploy = (state: ReducerHandlerState, payload: SetSortOnDeployPayload): ReducerHandlerState => {
  return util.setSafe(state, [nameof('sortOnDeploy'), payload.profileId], payload.sort);
};

const setFixCommonIssues = (state: ReducerHandlerState, payload: SetFixCommonIssuesPayload): ReducerHandlerState => {
  return util.setSafe(state, [nameof('fixCommonIssues'), payload.profileId], payload.fixCommonIssues);
};

const setBetaSorting = (state: ReducerHandlerState, payload: SetBetaSortingPayload): ReducerHandlerState => {
  return util.setSafe(state, [nameof('betaSorting'), payload.profileId], payload.betaSorting);
};

const setCurrentSave = (state: ReducerHandlerState, payload: SetCurrentSavePayload): ReducerHandlerState => {
  return util.setSafe(state, [nameof('saveName'), payload.profileId], payload.saveId);
};

const setLoadOrder = (state: ReducerHandlerState, payload: SetLoadOrderPayload): ReducerHandlerState => {
  return util.setSafe(state, [payload.id], payload.order);
};

const setLanguage = (state: ReducerHandlerState, payload: SetLanguagePayload): ReducerHandlerState => {
  Utils.setLanguage(i18nToBannerlord(payload));
  return state;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getReducers = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducers: { [key: string]: ReducerHandler<any> } = {};
  createReducer(actionsSettings.setSortOnDeploy, setSortOnDeploy, reducers);
  createReducer(actionsSettings.setFixCommonIssues, setFixCommonIssues, reducers);
  createReducer(actionsSettings.setBetaSorting, setBetaSorting, reducers);
  createReducer(actionsSave.setCurrentSave, setCurrentSave, reducers);
  createReducer(actions.setLoadOrder, setLoadOrder, reducers);
  // TODO: The smartass solution didn't work here, so I had to do it manually
  //createReducer(actions.setLanguage, setLanguage, reducer);
  reducers[actions.setLanguage.getType()] = setLanguage;
  return reducers;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getDefaults = () => ({
  [nameof('sortOnDeploy')]: {},
  [nameof('fixCommonIssues')]: {},
  [nameof('saveName')]: {},
});

export const reducerSettings: types.IReducerSpec = {
  reducers: getReducers(),
  defaults: getDefaults(),
};

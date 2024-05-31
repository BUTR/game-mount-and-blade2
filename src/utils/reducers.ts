import { actions, types, util } from 'vortex-api';
import { actionsSettings, actionsSave, ReducerHandler, ReducerHandlerState, createReducer, nameof } from '.';
import { IBannerlordSettings } from '../types';

// TODO: Ask IDCs to provider a proper type system?
type SetLoadOrderPayload = {
  id: string;
  order: unknown[];
};

const setSaveInState = (state: ReducerHandlerState, payload: actionsSave.SetCurrentSavePayload) => {
  return util.setSafe(state, [nameof<IBannerlordSettings>('saveName'), payload.profileId], payload.saveId);
};

const setSortOnDeployInState = (state: ReducerHandlerState, payload: actionsSettings.SetSortOnDeployPayload) => {
  return util.setSafe(state, [nameof<IBannerlordSettings>('sortOnDeploy'), payload.profileId], payload.sort);
};

const setLoadOrderInState = (state: ReducerHandlerState, payload: SetLoadOrderPayload) => {
  return util.setSafe(state, [payload.id], payload.order);
};

const getReducers = () => {
  const reducers: { [key: string]: ReducerHandler<unknown> } = {};
  createReducer(actionsSettings.setSortOnDeploy, setSortOnDeployInState, reducers);
  createReducer(actions.setLoadOrder, setLoadOrderInState, reducers);
  createReducer(actionsSave.setCurrentSave, setSaveInState, reducers);
  return reducers;
};

const getDefaults = () => ({
  [nameof<IBannerlordSettings>('sortOnDeploy')]: {},
  [nameof<IBannerlordSettings>('saveName')]: {},
});

export const reducer: types.IReducerSpec = {
  reducers: getReducers(),
  defaults: getDefaults(),
};

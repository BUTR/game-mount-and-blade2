import { types } from 'vortex-api';
import { createReducer, updateAuto } from './redux';
import { actionsLauncher } from '../launcher';
import { IBannerlordSession } from '../types';

const defaults: IBannerlordSession = {
  useSteamBinariesOnXbox: false,
};

// Vortex API's IReducerSpec.reducers uses `any` for payload type, so we must match it
const reducers: types.IReducerSpec<IBannerlordSession>['reducers'] = {};

createReducer(
  actionsLauncher.setUseSteamBinariesOnXbox,
  (state, payload) => {
    const { useSteamBinariesOnXbox } = payload;

    return updateAuto(state, { useSteamBinariesOnXbox: { $set: useSteamBinariesOnXbox } });
  },
  reducers
);

const reducer: types.IReducerSpec<IBannerlordSession> = {
  reducers,
  defaults,
};

// Needed because the API expects the generic IReducerSpec
export const reducerSession = reducer as unknown as types.IReducerSpec;

import { types, util } from 'vortex-api';
import { createReducer, ReducerHandler, ReducerHandlerState } from './redux';
import { nameof as nameof2 } from '../nameof';
import { actionsLauncher, SetUseSteamBinariesOnXboxPayload } from '../launcher';
import { IBannerlordSession } from '../types';

const nameof = nameof2<IBannerlordSession>;

const setUseSteamBinariesOnXbox = (
  state: ReducerHandlerState,
  payload: SetUseSteamBinariesOnXboxPayload
): ReducerHandlerState => {
  return util.setSafe(state, [nameof('useSteamBinariesOnXbox')], payload.useSteamBinariesOnXbox);
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getReducers = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducers: { [key: string]: ReducerHandler<any> } = {};
  createReducer(actionsLauncher.setUseSteamBinariesOnXbox, setUseSteamBinariesOnXbox, reducers);
  return reducers;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getDefaults = () => ({
  [nameof('useSteamBinariesOnXbox')]: false,
});

export const reducerSession: types.IReducerSpec = {
  reducers: getReducers(),
  defaults: getDefaults(),
};

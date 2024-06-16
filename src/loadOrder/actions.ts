// This is a risk, since we won't notice if the API changes
// TODO: Ask IDCs to provider a proper type system
import { types } from 'vortex-api';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const setFBForceUpdate = (profileId: string) => ({
  type: 'SET_FB_FORCE_UPDATE',
  payload: {
    profileId,
  },
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const setFBLoadOrderEntry = (profileId: string, loEntry: types.ILoadOrderEntry) => ({
  type: 'SET_FB_LOAD_ORDER_ENTRY',
  payload: {
    profileId,
    loEntry,
  },
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const setFBLoadOrder = (profileId: string, loadOrder: types.LoadOrder) => ({
  type: 'SET_FB_LOAD_ORDER',
  payload: {
    profileId,
    loadOrder,
  },
});
export const actionsLoadOrder = {
  setFBForceUpdate,
  setFBLoadOrderEntry,
  setFBLoadOrder,
};

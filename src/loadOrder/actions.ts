// Ideally should be taken from vortex-api
import { types } from 'vortex-api';

interface ISetFBForceUpdateAction {
  type: 'SET_FB_FORCE_UPDATE';
  payload: { profileId: string };
}

const setFBForceUpdate = (profileId: string): ISetFBForceUpdateAction => ({
  type: 'SET_FB_FORCE_UPDATE',
  payload: {
    profileId,
  },
});

interface ISetFBLoadOrderEntryAction {
  type: 'SET_FB_LOAD_ORDER_ENTRY';
  payload: { profileId: string; loEntry: types.ILoadOrderEntry };
}

const setFBLoadOrderEntry = (profileId: string, loEntry: types.ILoadOrderEntry): ISetFBLoadOrderEntryAction => ({
  type: 'SET_FB_LOAD_ORDER_ENTRY',
  payload: {
    profileId,
    loEntry,
  },
});

interface ISetFBLoadOrderAction {
  type: 'SET_FB_LOAD_ORDER';
  payload: { profileId: string; loadOrder: types.LoadOrder };
}

const setFBLoadOrder = (profileId: string, loadOrder: types.LoadOrder): ISetFBLoadOrderAction => ({
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

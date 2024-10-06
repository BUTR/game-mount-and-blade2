import { types, util } from 'vortex-api';
import { createReducer, ReducerHandler, ReducerHandlerState } from './redux';
import { nameof as nameof2 } from '../nameof';
import { IBannerlordPersistent } from '../types';
import { actionsCollections, SetCollectionDataPayload, SetCollectionModOptionsPayload } from '../collections/actions';

const nameof = nameof2<IBannerlordPersistent>;

const setCollectionGeneralData = (
  state: ReducerHandlerState,
  payload: SetCollectionDataPayload
): ReducerHandlerState => {
  return util.setSafe(state, [nameof('collectionGeneralData'), payload.collectionSlug], payload.collectionData);
};

const setCollectionModOptions = (
  state: ReducerHandlerState,
  payload: SetCollectionModOptionsPayload
): ReducerHandlerState => {
  return util.setSafe(state, [nameof('collectionModOptions'), payload.collectionSlug], payload.collectionData);
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getReducers = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reducers: { [key: string]: ReducerHandler<any> } = {};
  createReducer(actionsCollections.setCollectionGeneralData, setCollectionGeneralData, reducers);
  createReducer(actionsCollections.setCollectionModOptions, setCollectionModOptions, reducers);
  return reducers;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getDefaults = () => ({
  [nameof('collectionGeneralData')]: {},
  [nameof('collectionModOptions')]: {},
});

export const reducersPersistence: types.IReducerSpec = {
  reducers: getReducers(),
  defaults: getDefaults(),
};

import { BaseActionCreator, ComplexActionCreator } from 'redux-act';

export type ReducerHandlerState = {
  [key: string]: unknown;
};

export type ReducerHandler<P> = (state: ReducerHandlerState, payload: P) => ReducerHandlerState;

export const createReducer = <P, M>(
  actionCreator: BaseActionCreator<ComplexActionCreator<P, M>>,
  action: ReducerHandler<P>,
  reducers: { [key: string]: ReducerHandler<P> }
) => {
  reducers[actionCreator.getType()] = action;
};

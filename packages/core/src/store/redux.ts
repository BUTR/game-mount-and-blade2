import { BaseActionCreator, ComplexActionCreator } from "redux-act";
import update, { CustomCommands, extend, Spec } from "immutability-helper";
import { types } from "@nexusmods/vortex-api";

// Extend immutability-helper with $auto to auto-create missing objects
extend("$auto", (value: Spec<object>, object: object) => {
  return object !== undefined && object !== null
    ? update(object, value)
    : update({}, value);
});

// Type for the $auto custom command
type AutoCommand<T> = { $auto: Spec<T, AutoCommands<T>> };
type AutoCommands<T> = CustomCommands<{ $auto: Spec<T> }>;

// Spec that supports $auto at any level for objects with index signatures
type SpecWithAuto<T> =
  | Spec<T, AutoCommands<T>>
  | { [K in keyof T]?: SpecWithAuto<T[K]> | AutoCommand<T[K]> };

// Typed wrapper for update that allows $auto command
export const updateAuto = <T>(object: T, spec: SpecWithAuto<T>): T =>
  update(object, spec as Spec<T, AutoCommands<T>>);

// Ideally should be taken from vortex-api
export type ReducerHandler<S, P> = (state: S, payload: P) => S;
export const createReducer = <S, P, M>(
  actionCreator: BaseActionCreator<ComplexActionCreator<P, M>>,
  action: ReducerHandler<S, P>,
  reducers: types.IReducerSpec<S>["reducers"],
): void => {
  reducers[actionCreator.getType()] = action;
};

// The reducers of any part of a state, they get the whole state and keep the keys they don't handle
type PartReducers = Record<string, (state: never, payload: never) => unknown>;

/**
 * Combines the reducers of several parts of the same state, an action several parts handle runs each of their
 * handlers in turn
 */
export const mergeReducers = <S>(
  ...parts: PartReducers[]
): types.IReducerSpec<S>["reducers"] => {
  const merged: types.IReducerSpec<S>["reducers"] = {};
  for (const part of parts) {
    for (const [type, handler] of Object.entries(part)) {
      const next = handler as (state: S, payload: unknown) => S;
      const previous = merged[type];
      merged[type] =
        previous === undefined
          ? next
          : (state, payload) => next(previous(state, payload), payload);
    }
  }
  return merged;
};

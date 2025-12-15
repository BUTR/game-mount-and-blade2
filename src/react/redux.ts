import { BaseActionCreator, ComplexActionCreator } from "redux-act";
import update, { CustomCommands, extend, Spec } from "immutability-helper";
import { types } from "vortex-api";

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

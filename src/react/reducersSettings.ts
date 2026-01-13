import { actions, types } from "vortex-api";
import { Utils } from "@butr/vortexextensionnative";
import { ComplexActionCreator1 } from "redux-act";
import { createReducer, updateAuto } from "./redux";
import { actionsSave } from "../save";
import { actionsSettings, IBannerlordSettings } from "../settings";
import { i18nToBannerlord } from "../localization";

const defaults: IBannerlordSettings = {
  sortOnDeploy: {},
  fixCommonIssues: {},
  saveName: {},
  betaSorting: {},
};

// Vortex API's IReducerSpec.reducers uses `any` for payload type, so we must match it
const reducers: types.IReducerSpec<IBannerlordSettings>["reducers"] = {};

createReducer(
  actionsSettings.setSortOnDeploy,
  (state, payload) => {
    const { profileId, sort } = payload;

    return updateAuto(state, {
      sortOnDeploy: { $auto: { [profileId]: { $set: sort } } },
    });
  },
  reducers,
);

createReducer(
  actionsSettings.setFixCommonIssues,
  (state, payload) => {
    const { profileId, fixCommonIssues } = payload;

    return updateAuto(state, {
      fixCommonIssues: { $auto: { [profileId]: { $set: fixCommonIssues } } },
    });
  },
  reducers,
);

createReducer(
  actionsSettings.setBetaSorting,
  (state, payload) => {
    const { profileId, betaSorting } = payload;

    return updateAuto(state, {
      betaSorting: { $auto: { [profileId]: { $set: betaSorting } } },
    });
  },
  reducers,
);

createReducer(
  actionsSave.setCurrentSave,
  (state, payload) => {
    const { profileId, saveId } = payload;

    return updateAuto(state, {
      saveName: { $auto: { [profileId]: { $set: saveId } } },
    });
  },
  reducers,
);

createReducer(
  actions.setLoadOrder,
  (state, payload) => {
    const { id, order } = payload;

    return updateAuto(state, { [id]: { $set: order } });
  },
  reducers,
);

createReducer(
  actions.setLanguage as ComplexActionCreator1<
    string,
    string,
    Record<string, never>
  >,
  (state, payload: string) => {
    Utils.setLanguage(i18nToBannerlord(payload));
    return state;
  },
  reducers,
);

const reducer: types.IReducerSpec<IBannerlordSettings> = {
  reducers,
  defaults,
};

// Needed because the API expects the generic IReducerSpec
export const reducerSettings = reducer as unknown as types.IReducerSpec;

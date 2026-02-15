export {};

import { selectors, types } from "vortex-api";
import { ComplexActionCreator1 } from "redux-act";
import { IStateWithBannerlord } from "../src/types";

declare module "vortex-api" {
  namespace actions {
    const setLanguage: ComplexActionCreator1<
      string,
      string,
      Record<string, never>
    >;
  }
  namespace selectors {
    const activeProfile: (state: types.IState) => types.IProfile | undefined;
    const lastActiveProfileForGame: (
      state: types.IState,
      gameId: string,
    ) => string | undefined;
    const currentGameDiscovery: (
      state: types.IState,
    ) => types.IDiscoveryResult | undefined;
    const discoveryByGame: (
      state: types.IState,
      gameId: string,
    ) => types.IDiscoveryResult | undefined;
    const activeGameId: (state: types.IState) => string | undefined;
    const profileById: (
      state: types.IState,
      profileId: string,
    ) => types.IProfile | undefined;
    const installPathForGame: (
      state: types.IState,
      gameId: string,
    ) => string | undefined;
  }
}

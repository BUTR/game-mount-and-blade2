export {};

import { types } from "vortex-api";
import { ComplexActionCreator1, ComplexActionCreator2 } from "redux-act";

declare module "vortex-api" {
  namespace actions {
    const setLanguage: ComplexActionCreator1<
      string,
      string,
      Record<string, never>
    >;
    const setFBLoadOrderEntry: ComplexActionCreator2<
      string,
      types.ILoadOrderEntry,
      { profileId: string; loEntry: types.ILoadOrderEntry },
      Record<string, never>
    >;
    const setFBLoadOrder: ComplexActionCreator2<
      string,
      types.LoadOrder,
      { profileId: string; loadOrder: types.LoadOrder },
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

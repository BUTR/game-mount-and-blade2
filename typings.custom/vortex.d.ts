export {};

import { types } from "@nexusmods/vortex-api";
import { ComplexActionCreator2 } from "redux-act";

// The published API declares these two action creators as `any`; give them real types.
declare module "@nexusmods/vortex-api" {
  namespace actions {
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
}

import { types } from "@nexusmods/vortex-api";
import { IVortexViewModelData } from "../types";

export type IFBLOItemRendererProps = Omit<
  types.IFBLOItemRendererProps,
  "loEntry"
> & {
  loEntry: types.IFBLOLoadOrderEntry<IVortexViewModelData>;
};

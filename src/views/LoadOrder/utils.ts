import { types } from "@nexusmods/vortex-api";
import { IVortexViewModelData } from "@bannerlord/core/types";

export const isExternal = (
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>,
): boolean => {
  return item.modId === undefined;
};

export const isLocked = (
  item: types.IFBLOLoadOrderEntry<IVortexViewModelData>,
): boolean => {
  return [true, "true", "always"].includes(item.locked as types.FBLOLockState);
};

export const isSteamWorksop = (
  data: IVortexViewModelData | undefined,
): boolean => {
  return data?.moduleInfoExtended.moduleProviderType === "Steam";
};

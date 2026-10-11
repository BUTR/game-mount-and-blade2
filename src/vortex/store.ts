import { types as vetypes } from "@butr/vortexextensionnative";
import path from "path";
import { VortexStoreIds } from "../types";
import {
  BINARY_FOLDER_STANDARD,
  BINARY_FOLDER_STANDARD_MODDING_KIT,
  BINARY_FOLDER_XBOX,
} from "../common";

export const vortexStoreToLibraryStore = (
  storeId: string,
): vetypes.GameStore => {
  switch (storeId) {
    case VortexStoreIds.Steam:
      return "Steam";
    case VortexStoreIds.GOG:
      return "GOG";
    case VortexStoreIds.Epic:
      return "Epic";
    case VortexStoreIds.Xbox:
      return "Xbox";
    default:
      return "Unknown";
  }
};

export const isStoreStandard = (store: string | undefined): store is string => {
  return [
    VortexStoreIds.Steam,
    VortexStoreIds.GOG,
    VortexStoreIds.Epic,
  ].includes(store as VortexStoreIds);
};

export const isStoreSteam = (store: string | undefined): store is string => {
  return store === VortexStoreIds.Steam;
};

export const isStoreXbox = (store: string | undefined): store is string => {
  return store === VortexStoreIds.Xbox;
};

export const getBinaryPath = (store: string | undefined): string => {
  return path.join(
    `bin`,
    isStoreXbox(store) ? BINARY_FOLDER_XBOX : BINARY_FOLDER_STANDARD,
  );
};

export const getBinaryModdingPath = (_store: string | undefined): string => {
  return path.join(`bin`, BINARY_FOLDER_STANDARD_MODDING_KIT);
};

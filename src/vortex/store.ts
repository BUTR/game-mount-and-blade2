import { types as vetypes } from "@butr/vortexextensionnative";
import { VortexStoreIds } from "../types";

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

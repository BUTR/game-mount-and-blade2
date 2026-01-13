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

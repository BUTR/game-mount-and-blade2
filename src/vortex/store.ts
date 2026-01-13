import { VortexStoreIds } from "../types";

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

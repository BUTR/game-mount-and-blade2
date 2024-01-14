import { VortexStoreIds } from "../types";

export const isStoreStandard = (store: string | undefined): boolean =>
  [VortexStoreIds.Steam, VortexStoreIds.GOG, , VortexStoreIds.Epic].includes((store as VortexStoreIds));

export const isStoreSteam = (store: string | undefined): boolean =>
  store === VortexStoreIds.Steam;

export const isStoreXbox = (store: string | undefined): boolean =>
  store === VortexStoreIds.Xbox;
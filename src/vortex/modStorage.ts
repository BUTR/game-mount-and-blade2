import { types } from "vortex-api";
import { BannerlordModuleManager } from "@butr/vortexextensionnative";
import { IBannerlordMod, IBannerlordModStorage } from "../types";

export const isModActive = (
  profile: types.IProfile | undefined,
  mod: IBannerlordMod,
): boolean => {
  // Warning: modState is not guaranteed to be present in the profile
  return profile?.modState?.[mod.id]?.enabled ?? false;
};
const isMod = (mod: IBannerlordMod, moduleId: string): boolean => {
  return mod.attributes?.subModsIds?.includes(moduleId) ?? false;
};

export const findModByPredicate = (
  mods: IBannerlordModStorage,
  predicate: (mod: IBannerlordMod) => boolean,
): IBannerlordMod | undefined => {
  const foundMods: IBannerlordMod[] = Object.values(mods).filter(predicate);

  if (foundMods.length === 0) return undefined;

  if (foundMods.length === 1) return foundMods[0];

  return foundMods.reduce<IBannerlordMod | undefined>(
    (prev: IBannerlordMod | undefined, iter: IBannerlordMod) => {
      if (!prev) {
        return iter;
      }
      const compareResult = BannerlordModuleManager.compareVersions(
        BannerlordModuleManager.parseApplicationVersion(
          iter.attributes?.version ?? "",
        ),
        BannerlordModuleManager.parseApplicationVersion(
          prev.attributes?.version ?? "",
        ),
      );
      switch (compareResult) {
        case 1:
          return iter;
        case -1:
          return prev;
        default:
          return iter;
      }
    },
    undefined,
  );
};

export const findMod = (
  mods: IBannerlordModStorage,
  moduleId: string,
): IBannerlordMod | undefined => {
  return findModByPredicate(mods, (mod) => isMod(mod, moduleId));
};

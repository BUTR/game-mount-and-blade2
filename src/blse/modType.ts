import { types } from "vortex-api";
import { BLSE_CLI_EXE } from "../common";
import { IBannerlordMod, IBannerlordModStorage } from "../types";
import { findModByPredicate } from "../vortex/modStorage";

export const isModTypeBLSE = (instructions: types.IInstruction[]): boolean => {
  return instructions.some(
    (inst) =>
      inst.type === "copy" &&
      inst.source !== undefined &&
      inst.source.endsWith(BLSE_CLI_EXE),
  );
};

const isModBLSE = (mod: IBannerlordMod): boolean => {
  return (
    mod.type === `bannerlord-blse` ||
    (mod.attributes?.modId === 1 && mod.attributes?.source === `nexus`)
  );
};

export const findBLSEMod = (
  mods: IBannerlordModStorage,
): IBannerlordMod | undefined => {
  return findModByPredicate(mods, isModBLSE);
};

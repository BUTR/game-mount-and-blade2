import { types } from "vortex-api";
import { BLSE_CLI_EXE } from "../common";

export const isModTypeBLSE = (instructions: types.IInstruction[]): boolean => {
  return instructions.some(
    (inst) =>
      inst.type === "copy" &&
      inst.source !== undefined &&
      inst.source.endsWith(BLSE_CLI_EXE),
  );
};

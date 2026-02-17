import { types } from "vortex-api";
import { BLSE_CLI_EXE } from "../common";
import { getGameInstallPath } from "../vortex";

export const getInstallPathBLSE = getGameInstallPath;

export const isModTypeBLSE = (instructions: types.IInstruction[]): boolean => {
  return instructions.some(
    (inst) =>
      inst.type === "copy" &&
      inst.source !== undefined &&
      inst.source.endsWith(BLSE_CLI_EXE),
  );
};

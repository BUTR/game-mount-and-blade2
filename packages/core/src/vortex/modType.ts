import { selectors, types } from "@nexusmods/vortex-api";
import { SUBMODULE_FILE } from "@bannerlord/game-layout";

export const getGameInstallPath = (
  api: types.IExtensionApi,
  game: types.IGame,
): string => {
  const discovery = selectors.discoveryByGame(api.getState(), game.id);
  return discovery?.path ?? ``;
};

const SUBMODULE_FILE_LOWER = SUBMODULE_FILE.toLowerCase();

export const isModTypeModule = (
  instructions: types.IInstruction[],
): boolean => {
  // Archives name it in any case, like the translation installer accepts
  return instructions.some(
    (instr) =>
      instr.type === "copy" &&
      instr.destination?.toLowerCase().endsWith(SUBMODULE_FILE_LOWER) === true,
  );
};

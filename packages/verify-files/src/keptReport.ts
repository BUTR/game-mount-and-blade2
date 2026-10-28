import { selectors, types } from "@nexusmods/vortex-api";
import { GAME_ID } from "@bannerlord/core/common";
import { IVerifyFilesReport } from "./types";
import { verifyFilesAsync } from "./verify";

interface IKeptReport {
  gamePath: string;
  report: IVerifyFilesReport;
}

/**
 * A report verified outside the page, which the page shows the next time it's opened instead of verifying again
 */
let kept: IKeptReport | undefined;

/**
 * Vortex's writes into the game folder so far. A report verified while Vortex wrote is of neither folder
 */
let writes = 0;

// Deploying and purging, and deploying a single mod, which extensions ask for without deploying
const WRITE_EVENTS = [
  "will-deploy",
  "did-deploy",
  "will-purge",
  "did-purge",
  "deploy-single-mod",
];

/**
 * Drops the kept report when Vortex writes into the game folder
 */
export const watchGameFolderWrites = (api: types.IExtensionApi): void => {
  for (const event of WRITE_EVENTS) {
    api.onAsync?.(event, () => {
      writes++;
      kept = undefined;
      return Promise.resolve();
    });
  }
};

const getGamePath = (api: types.IExtensionApi): string | undefined =>
  selectors.discoveryByGame(api.getState(), GAME_ID)?.path;

/**
 * Verifies the game folder and keeps the report for the page, unless Vortex wrote into the folder or the folder
 * changed meanwhile
 */
export const verifyAndKeepAsync = async (
  api: types.IExtensionApi,
): Promise<IVerifyFilesReport> => {
  const writesBefore = writes;
  const gamePath = getGamePath(api);
  const report = await verifyFilesAsync(api);
  if (
    gamePath !== undefined &&
    writes === writesBefore &&
    getGamePath(api) === gamePath
  ) {
    kept = { gamePath, report };
  }
  return report;
};

/**
 * The kept report when it's of the game's folder and store, once, the page verifies again after that
 */
export const takeKeptReport = (
  gamePath: string | undefined,
  store: string | undefined,
): IVerifyFilesReport | undefined => {
  const report =
    kept !== undefined &&
    kept.gamePath === gamePath &&
    kept.report.store === store
      ? kept.report
      : undefined;
  kept = undefined;
  return report;
};

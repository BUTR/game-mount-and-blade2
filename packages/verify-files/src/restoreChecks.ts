import path from "path";
import { IFilesArchive } from "./archive";
import { IVerifyFilesReport } from "./types";
import { getFolder } from "./verify";
import { getPathExistsAsync } from "@bannerlord/core/fsUtils";
import { MODULES, SUBMODULE_FILE } from "@bannerlord/game-layout";

/**
 * A module of the archive whose folder the game folder has again, restoring would mix the archived files into it
 */
export interface IModuleConflict {
  /**
   * Modules/{module}
   */
  folder: string;
  /**
   * Whether Vortex deployed what's in the folder now
   */
  deployedByVortex: boolean;
}

/**
 * A build of the game, by its version when it's known
 */
export interface IGameBuild {
  buildId: string;
  version?: string;
}

export interface IVersionMismatch {
  archived: IGameBuild;
  installed: IGameBuild;
}

const toGameBuild = (
  buildId: string,
  version: string | undefined,
): IGameBuild => (version !== undefined ? { buildId, version } : { buildId });

/**
 * The game's version the archive's files are from and the installed one, when they differ. By version when both
 * are known, by the store's build otherwise
 */
export const getVersionMismatch = (
  archive: IFilesArchive,
  report: IVerifyFilesReport,
): IVersionMismatch | undefined => {
  const mismatch = {
    archived: toGameBuild(archive.buildId, archive.gameVersion),
    installed: toGameBuild(report.buildId, report.version),
  };
  if (archive.gameVersion !== undefined && report.version !== undefined) {
    return archive.gameVersion !== report.version ? mismatch : undefined;
  }
  // Builds of different stores can't be compared, the same version has a build in each
  return archive.store === report.store && archive.buildId !== report.buildId
    ? mismatch
    : undefined;
};

/**
 * The modules of these archived files whose folder the game folder has. The game's own modules aren't, files a mod
 * put into them are restored as they were: their SubModule.xml is a file of the build, not an extra one
 */
export const findModuleConflictsAsync = async (
  gamePath: string,
  report: IVerifyFilesReport,
  paths: readonly string[],
): Promise<IModuleConflict[]> => {
  const modulesFolder = `${MODULES}/`.toLowerCase();
  const folders = [
    ...new Set(
      paths
        .map(getFolder)
        .filter((folder) => folder.toLowerCase().startsWith(modulesFolder)),
    ),
  ];

  const extras = new Map(
    report.files
      .filter((file) => file.status === "extra")
      .map((file) => [file.path.toLowerCase(), file]),
  );
  const conflicts: IModuleConflict[] = [];
  for (const folder of folders) {
    if (!(await getPathExistsAsync(path.join(gamePath, folder)))) {
      continue;
    }
    const subModulePath = `${folder}/${SUBMODULE_FILE}`;
    const isGameModule =
      !extras.has(subModulePath.toLowerCase()) &&
      (await getPathExistsAsync(path.join(gamePath, subModulePath)));
    if (isGameModule) {
      continue;
    }
    conflicts.push({
      folder,
      deployedByVortex: report.files.some(
        (file) => file.folder === folder && file.source === "vortex",
      ),
    });
  }
  return conflicts.sort((lhs, rhs) => lhs.folder.localeCompare(rhs.folder));
};

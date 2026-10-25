import path from "path";
import { actions, log, selectors, types } from "@nexusmods/vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import { ILobbyServer } from "@bannerlord/lobby";
import { IClientModuleStatus } from "./modules";
import { IServerRow } from "./row";
import { formatServerAddress } from "@bannerlord/server-query/address";
import { BANNERLORD_EXE, GAME_ID } from "@bannerlord/core/common";
import {
  IBannerlordMod,
  IBannerlordModStorage,
  IModuleCache,
  IStateWithBannerlord,
} from "@bannerlord/core/types";
import {
  checkModDeploy,
  DeployModResult,
  deployModAsync,
  DeployModStatus,
} from "@bannerlord/core/blse/modDeploy";
import { resolveModDeployAsync } from "@bannerlord/core/blse/deploy";
import { downloadAndEnableLatestModVersionAsync } from "@bannerlord/core/vortex/modDownloader";
import { findModDownload } from "@bannerlord/core/vortex/modFinder";
import { findModByPredicate } from "@bannerlord/core/vortex/modStorage";
import { getRequiredDependencyIds } from "@bannerlord/core/vortex/moduleAttributes";
import { getBinaryPath } from "@bannerlord/core/vortex/store";
import { bselectors } from "@bannerlord/core/selectors";

/**
 * The client module that joins the server named on the command line once the multiplayer lobby is ready
 * (BUTR/Bannerlord.ServerInfo, src/Bannerlord.ServerJoin)
 */
export const JOIN_MODULE_ID = "Bannerlord.ServerJoin";

/**
 * Server Join on Nexus Mods, the mod that provides the join module
 */
export const SERVER_JOIN_MOD_ID = 13892;
export const SERVER_JOIN_URL = `https://www.nexusmods.com/${GAME_ID}/mods/${SERVER_JOIN_MOD_ID}`;
const JOIN_ARGUMENT = "/joinserver";
const OFFICIAL_MULTIPLAYER_MODULES = ["Native", "Multiplayer"];

/**
 * The game signs in to the lobby itself when started directly on Steam and GOG. The Epic version needs the
 * Epic Games Launcher's one-time code and the Xbox version its package identity, neither of which a direct start has
 */
const JOINABLE_STORES = ["steam", "gog"];

/**
 * Official and TaleWorlds-hosted servers, which the game lists with the TaleWorlds host. The rest are community servers
 * (MPCustomGameItemVM.IsCommunityServer)
 */
export const isOfficialServer = (lobby: ILobbyServer): boolean =>
  lobby.IsOfficial || lobby.ByOfficialProvider;

/**
 * Why Vortex doesn't join the server at all, null when it can. Unlike the blockers, nothing on this side fixes it:
 * the server would refuse a client that loads the join module, so it is joined from the game
 */
export const getJoinUnsupportedReason = (row: IServerRow): string | null => {
  const lobby = row.lobby;
  if (lobby === null) {
    return null;
  }
  if (isOfficialServer(lobby)) {
    return "Official servers are joined from the game. Vortex only joins community servers.";
  }
  // The client loads the join module, a server only accepts modules it lists unless it allows optional ones
  const listsJoinModule = (lobby.LoadedModules ?? []).some(
    (module) => module.Id === JOIN_MODULE_ID,
  );
  if (!listsJoinModule && !lobby.AllowsOptionalModules) {
    return (
      "This server doesn't allow optional mods and doesn't list Server Join, so it would refuse the module " +
      "Vortex joins with. Join it from the game."
    );
  }
  return null;
};

export interface IJoinTarget {
  store: string | undefined;
  gamePath: string | undefined;
  gameRunning: boolean;
}

export interface IJoinContext extends IJoinTarget {
  installedModules: IModuleCache | null;
  requiredModules: IClientModuleStatus[];
}

/**
 * Why the selected server can't be joined from Vortex at all right now, whichever profile is used
 */
export const getSharedJoinBlockers = (
  row: IServerRow,
  target: IJoinTarget,
): string[] => {
  const blockers: string[] = [];
  const unsupported = getJoinUnsupportedReason(row);
  if (unsupported !== null) {
    blockers.push(unsupported);
  }
  if (target.gamePath === undefined) {
    blockers.push("Bannerlord has not been discovered.");
  } else if (
    target.store === undefined ||
    !JOINABLE_STORES.includes(target.store)
  ) {
    blockers.push(
      `Joining from Vortex needs the Steam or GOG version of the game, this is the ${target.store ?? "unknown"} version.`,
    );
  }
  if (row.lobby === null) {
    blockers.push(
      "The server is not in the lobby list. Refresh the lobby to join it.",
    );
  }
  if (target.gameRunning) {
    blockers.push(
      "Bannerlord or another tool started from Vortex is running. Vortex doesn't deploy mods while it runs.",
    );
  }
  return blockers;
};

/**
 * Whether joining from Vortex can work at all: Server Join is installed in Vortex from Nexus Mods, or its module is
 * somewhere the game or Vortex finds it, installed by hand or from another source. Null while that is being read
 *
 * @param stagedModuleIds the modules of every mod installed in Vortex, enabled or not
 */
export const isServerJoinAvailable = (
  mods: IBannerlordModStorage | undefined,
  deployedModules: IModuleCache | null,
  stagedModuleIds: { has: (id: string) => boolean } | null,
): boolean | null => {
  const hasServerJoinMod = Object.values(mods ?? {}).some(
    (mod) =>
      mod.state === "installed" &&
      Number(mod.attributes?.["modId"]) === SERVER_JOIN_MOD_ID,
  );
  if (
    hasServerJoinMod ||
    deployedModules?.[JOIN_MODULE_ID] !== undefined ||
    stagedModuleIds?.has(JOIN_MODULE_ID) === true
  ) {
    return true;
  }
  return deployedModules === null || stagedModuleIds === null ? null : false;
};

/**
 * The mod that provides the join module, the one mod the No Mods profile keeps
 */
export const isServerJoinMod = (mod: IBannerlordMod): boolean =>
  Number(mod.attributes?.["modId"]) === SERVER_JOIN_MOD_ID ||
  (mod.attributes?.subModsIds?.includes(JOIN_MODULE_ID) ?? false);

/**
 * What Server Join still needs in the active profile: a download, an install or enabling. OK when it is enabled
 */
export const checkServerJoinDeploy = (
  api: types.IExtensionApi,
  profile: types.IProfile,
  mods: IBannerlordModStorage,
): DeployModResult =>
  checkModDeploy(
    profile,
    findModByPredicate(mods, isServerJoinMod),
    findModDownload(api, SERVER_JOIN_MOD_ID),
  );

/**
 * Whether Server Join is installed in Vortex but not enabled in the active profile. Reads the state now, so it holds
 * for the profile a join just switched to
 */
export const isServerJoinDisabled = (api: types.IExtensionApi): boolean => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  return (
    profile !== undefined &&
    checkServerJoinDeploy(api, profile, state.persistent.mods[GAME_ID] ?? {})
      .status === DeployModStatus.NOT_ENABLED
  );
};

/**
 * Gets, installs or enables whatever Server Join is missing in the active profile, and deploys it unless it had to
 * be downloaded, which only enables it
 */
export const setUpServerJoinAsync = async (
  api: types.IExtensionApi,
): Promise<void> => {
  const state = api.getState<IStateWithBannerlord>();
  const profile = selectors.activeProfile(state);
  if (!profile) {
    return;
  }
  await resolveModDeployAsync(
    api,
    profile,
    checkServerJoinDeploy(api, profile, bselectors.bannerlordMods(state)),
    (api) => downloadAndEnableLatestModVersionAsync(api, SERVER_JOIN_MOD_ID),
    deployModAsync,
  );
};

/**
 * @param installedInVortex Server Join is installed in Vortex, only not enabled in the current profile
 */
export const getJoinModuleBlocker = (installedInVortex = false): string =>
  installedInVortex
    ? `Enable Server Join (${JOIN_MODULE_ID}) in your current profile, it joins the server once the game is in the lobby.`
    : `Install the BUTR Server Join module (${JOIN_MODULE_ID}), it joins the server once the game is in the lobby.`;

/**
 * Why the server can't be joined with the mods deployed by the current profile
 *
 * @param serverJoinDisabled Server Join is installed in Vortex but not enabled in the current profile
 */
export const getCurrentProfileBlockers = (
  installedModules: IModuleCache | null,
  requiredModules: IClientModuleStatus[],
  serverJoinDisabled = false,
): string[] => {
  const blockers: string[] = [];
  if (installedModules === null) {
    blockers.push("Reading the installed modules...");
  } else if (installedModules[JOIN_MODULE_ID] === undefined) {
    blockers.push(getJoinModuleBlocker(serverJoinDisabled));
  }
  const notReady = requiredModules.filter(
    (status) => status.requirement.required && status.state !== "installed",
  );
  if (notReady.length > 0) {
    blockers.push(
      `Install the required mods first: ${notReady.map((status) => status.requirement.name).join(", ")}.`,
    );
  }
  return blockers;
};

/**
 * Why the selected server can't be joined from Vortex right now, empty when it can
 */
export const getJoinBlockers = (
  row: IServerRow,
  context: IJoinContext,
): string[] => [
  ...getSharedJoinBlockers(row, context),
  ...getCurrentProfileBlockers(
    context.installedModules,
    context.requiredModules,
  ),
];

/**
 * Native, Multiplayer, the modules enabled in the multiplayer load order, the server's modules, everything they need
 * and the join module, in a valid load order. Optional dependencies and modules that are not installed are left out;
 * the server only enforces its own list
 *
 * @param loadOrderIds the modules enabled in the profile's multiplayer load order, in its order. Ones that aren't
 * installed are skipped, not reported missing, the load order can list a module that was removed since
 */
export const resolveJoinModules = (
  requiredIds: string[],
  installed: IModuleCache,
  loadOrderIds: string[] = [],
): { modules: vetypes.ModuleInfoExtended[]; missing: string[] } => {
  const selected = new Map<string, vetypes.ModuleInfoExtended>();
  const missing: string[] = [];
  const queue = [
    ...OFFICIAL_MULTIPLAYER_MODULES,
    ...loadOrderIds.filter((id) => installed[id] !== undefined),
    ...requiredIds,
    JOIN_MODULE_ID,
  ];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (selected.has(id)) {
      continue;
    }
    const module = installed[id];
    if (module === undefined) {
      if (!missing.includes(id)) {
        missing.push(id);
      }
      continue;
    }
    selected.set(id, module);
    queue.push(...getRequiredDependencyIds(module));
  }
  return {
    modules: BannerlordModuleManager.sort([...selected.values()]),
    missing,
  };
};

export const buildJoinArguments = (
  modules: vetypes.ModuleInfoExtended[],
  row: IServerRow,
): string[] => [
  "/multiplayer",
  `_MODULES_*${modules.map((module) => module.id).join("*")}*_MODULES_`,
  JOIN_ARGUMENT,
  ...(row.lobby !== null ? [row.lobby.Id.Guid] : []),
  formatServerAddress(row),
];

/**
 * Whether the game or any tool Vortex started is running. Vortex doesn't deploy while one is, it skips the deploy
 * without an error, so joining would start the game with whatever is on disk
 */
export const isGameRunning = (state: types.IState): boolean =>
  Object.keys(state.session.base.toolsRunning ?? {}).length > 0;

/**
 * Launches the native game executable directly (as the platform store would); the platform client must be running.
 * Singleplayer launchers like BLSE are never used. Resolves once the process starts, returning true if launched
 * successfully, or false if a launch hook cancelled it. (Vortex's `runExecutable` does not settle until the process exits,
 * even when detached.)
 *
 * Marks the executable as a running tool in Vortex state, which Vortex's process monitor will clear once the game exits.
 */
export const launchJoinAsync = (
  api: types.IExtensionApi,
  gamePath: string,
  store: string | undefined,
  args: string[],
): Promise<boolean> => {
  const binaries = path.join(gamePath, getBinaryPath(store));
  const exePath = path.join(binaries, BANNERLORD_EXE);
  return new Promise<boolean>((resolve, reject) => {
    let spawned = false;
    api
      .runExecutable(exePath, args, {
        cwd: binaries,
        detach: true,
        suggestDeploy: false,
        shell: false,
        expectSuccess: false,
        onSpawned: (pid?: number) => {
          // onSpawned is called immediately even if launch fails (with pid === undefined);
          // runExecutable will reject with the error shortly after.
          if (pid === undefined) {
            return;
          }
          spawned = true;
          api.store?.dispatch(
            actions.setToolRunning(exePath, Date.now(), true),
          );
          resolve(true);
        },
      })
      .then(() => resolve(spawned))
      .catch((err: unknown) => {
        if (!spawned) {
          reject(err);
          return;
        }
        log("warn", "Bannerlord exited with an error after joining", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
};

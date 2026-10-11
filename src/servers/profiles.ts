import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import { actions, types, util } from "vortex-api";
import {
  BannerlordModuleManager,
  types as vetypes,
} from "@butr/vortexextensionnative";
import {
  getJoinModuleBlocker,
  getRequiredDependencyIds,
  isServerJoinMod,
  JOIN_MODULE_ID,
} from "./join";
import { IClientModuleRequirement } from "./modules";
import { IServerRow } from "./row";
import { formatServerAddress, sanitizeServerText } from "./utils";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  SUB_MODS_IDS,
  SUBMODULE_FILE,
} from "../common";
import { versionToString } from "../butr/version";
import { IBannerlordMod, IBannerlordModStorage, IModuleCache } from "../types";
// Not the loadOrder index, which reaches the views and through them back here
import { enableInProfileLoadOrderAsync } from "../loadOrder/persistence";
import { enableModsAsync } from "../vortex/deploy";

/**
 * The profile feature that ties a profile to a server, by server id (host:port).
 * Keeping it on the profile means a deleted profile takes the link with it
 */
export const SERVER_PROFILE_FEATURE = "bannerlord_server";

/**
 * The profile feature holding the name of the server a server profile was made for, as the lobby lists it.
 * Kept up to date while the lobby lists the server, servers can be renamed. Missing for servers it doesn't list
 */
export const SERVER_NAME_PROFILE_FEATURE = "bannerlord_server_name";

/**
 * Vortex's own profile feature, the description its profile cards show and its editor changes. A server profile's is
 * the server's name, until the user writes their own
 */
const DESCRIPTION_PROFILE_FEATURE = "profile-description";

/**
 * The profile feature of the one profile shared by every server that runs without mods. It only enables the join
 * module, so a server without mods doesn't get a profile of its own
 */
export const NO_MODS_PROFILE_FEATURE = "bannerlord_server_no_mods";

const PROFILE_NAME_LIMIT = 64;
// How deep SubModule.xml can be inside a mod's staging folder: Modules/<id>/SubModule.xml
const SUBMODULE_SEARCH_DEPTH = 3;

/**
 * The profile made for a server earlier; joining A, then B, then A again reuses A's profile
 */
export const findServerProfile = (
  profiles: Readonly<Record<string, types.IProfile>>,
  serverId: string,
): types.IProfile | undefined =>
  Object.values(profiles)
    .filter(
      (profile) =>
        profile.gameId === GAME_ID &&
        profile.pendingRemove !== true &&
        profile.features?.[SERVER_PROFILE_FEATURE] === serverId,
    )
    .sort((a, b) => (b.lastActivated ?? 0) - (a.lastActivated ?? 0))[0];

/**
 * The shared profile for servers without mods, made the first time one of them was joined
 */
export const findNoModsProfile = (
  profiles: Readonly<Record<string, types.IProfile>>,
): types.IProfile | undefined =>
  Object.values(profiles)
    .filter(
      (profile) =>
        profile.gameId === GAME_ID &&
        profile.pendingRemove !== true &&
        profile.features?.[NO_MODS_PROFILE_FEATURE] === true,
    )
    .sort((a, b) => (b.lastActivated ?? 0) - (a.lastActivated ?? 0))[0];

/**
 * The server's name as the lobby lists it, without control characters. Undefined when the lobby doesn't list it
 */
export const getServerName = (row: IServerRow): string | undefined => {
  const name = sanitizeServerText(row.lobby?.ServerName ?? "");
  return name.length > 0 ? name : undefined;
};

/**
 * The server name comes from the lobby, so it's trimmed to something that fits a profile name
 */
export const getServerProfileName = (row: IServerRow): string => {
  const label = getServerName(row) ?? formatServerAddress(row);
  return label.length > PROFILE_NAME_LIMIT
    ? `${label.slice(0, PROFILE_NAME_LIMIT - 1)}…`
    : label;
};

/**
 * A module as installed in Vortex, enabled or not
 */
export interface IStagedModule {
  modId: string;
  module: vetypes.ModuleInfoExtended;
}

/**
 * The modules in Vortex's staging folder by module id. Several mods can provide the same module
 */
export type StagedModules = Map<string, IStagedModule[]>;

const findSubModuleFilesAsync = async (
  folder: string,
  depth: number,
): Promise<string[]> => {
  const entries = await fs
    .readdir(folder, { withFileTypes: true })
    .catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(folder, entry.name);
    if (
      entry.isFile() &&
      entry.name.toLowerCase() === SUBMODULE_FILE.toLowerCase()
    ) {
      files.push(entryPath);
    } else if (entry.isDirectory() && depth > 0) {
      files.push(...(await findSubModuleFilesAsync(entryPath, depth - 1)));
    }
  }
  return files;
};

/**
 * The modules read from each mod's staging folder, by mod id. The mods in the state change on every attribute update,
 * a mod's files only when it is installed again
 */
const stagedModCache = new Map<
  string,
  { key: string; modules: vetypes.ModuleInfoExtended[] }
>();

const readModModulesAsync = async (
  stagingPath: string,
  mod: IBannerlordMod,
  moduleIds: string[],
): Promise<vetypes.ModuleInfoExtended[]> => {
  const folder = path.join(stagingPath, mod.installationPath);
  const attributes = mod.attributes as Record<string, unknown> | undefined;
  const key = JSON.stringify([
    folder,
    moduleIds,
    attributes?.["version"],
    attributes?.["installTime"],
  ]);
  const cached = stagedModCache.get(mod.id);
  if (cached?.key === key) {
    return cached.modules;
  }

  const modules: vetypes.ModuleInfoExtended[] = [];
  let complete = true;
  for (const file of await findSubModuleFilesAsync(
    folder,
    SUBMODULE_SEARCH_DEPTH,
  )) {
    const xml = await fs.readFile(file, "utf8").catch(() => null);
    if (xml === null) {
      complete = false;
      continue;
    }
    const module = BannerlordModuleManager.getModuleInfo(xml);
    if (module !== undefined && moduleIds.includes(module.id)) {
      modules.push(module);
    }
  }
  // A file that couldn't be read is tried again next time
  if (complete) {
    stagedModCache.set(mod.id, { key, modules });
  }
  return modules;
};

/**
 * Reads the modules of every installed mod from the staging folder, so mods the current profile doesn't
 * deploy can still be resolved with their dependencies
 */
export const readStagedModulesAsync = async (
  stagingPath: string,
  mods: Readonly<IBannerlordModStorage>,
): Promise<StagedModules> => {
  const staged: StagedModules = new Map();
  for (const mod of Object.values(mods)) {
    const moduleIds = mod.attributes?.[SUB_MODS_IDS] ?? [];
    if (
      mod.state !== "installed" ||
      moduleIds.length === 0 ||
      !mod.installationPath
    ) {
      continue;
    }
    for (const module of await readModModulesAsync(
      stagingPath,
      mod,
      moduleIds,
    )) {
      const entries = staged.get(module.id) ?? [];
      entries.push({ modId: mod.id, module });
      staged.set(module.id, entries);
    }
  }
  return staged;
};

/**
 * Modules in the game folder that no Vortex mod provides: the official ones and anything installed by hand.
 * They stay in place whichever profile is deployed
 */
export const getUnmanagedModules = (
  deployed: Readonly<IModuleCache>,
  mods: Readonly<IBannerlordModStorage>,
): IModuleCache => {
  const managed = new Set(
    Object.values(mods).flatMap((mod) => mod.attributes?.[SUB_MODS_IDS] ?? []),
  );
  return Object.fromEntries(
    Object.entries(deployed).filter(([id]) => !managed.has(id)),
  );
};

export interface IServerProfileModule {
  id: string;
  name: string;
}

export interface IServerProfileVersionMismatch extends IServerProfileModule {
  wanted: string;
  available: string[];
}

/**
 * What a server profile needs: the Vortex mods to enable, and what can't be provided
 */
export interface IServerProfilePlan {
  modIds: string[];
  /**
   * The modules those provide, the server's and everything they depend on, for the multiplayer load order
   */
  modules: { id: string; name: string }[];
  missing: IServerProfileModule[];
  wrongVersion: IServerProfileVersionMismatch[];
}

/**
 * The mod with the module in the version asked for, the newest when any version does
 */
export const pickStagedModule = (
  candidates: IStagedModule[],
  wanted: string | null,
): IStagedModule | undefined => {
  if (wanted !== null) {
    return candidates.find(
      (candidate) => versionToString(candidate.module.version) === wanted,
    );
  }
  return candidates.reduce<IStagedModule | undefined>(
    (best, candidate) =>
      best === undefined ||
      BannerlordModuleManager.compareVersions(
        candidate.module.version,
        best.module.version,
      ) > 0
        ? candidate
        : best,
    undefined,
  );
};

/**
 * Picks the Vortex mods that provide the server's required modules, the join module and everything they depend on.
 * The server checks module versions exactly, so a required module is only taken in the version it asks for
 */
export const planServerProfile = (
  requirements: IClientModuleRequirement[],
  staged: StagedModules,
  unmanaged: Readonly<IModuleCache>,
): IServerProfilePlan => {
  const required = requirements.filter((requirement) => requirement.required);
  const names = new Map(
    required.map((requirement) => [requirement.id, requirement.name]),
  );
  const wantedVersions = new Map(
    required.map((requirement) => [requirement.id, requirement.version]),
  );
  const nameOf = (id: string): string => names.get(id) ?? id;

  const modIds = new Set<string>();
  const modules: { id: string; name: string }[] = [];
  const missing: IServerProfileModule[] = [];
  const wrongVersion: IServerProfileVersionMismatch[] = [];
  const seen = new Set<string>();
  const queue = [
    ...required.map((requirement) => requirement.id),
    JOIN_MODULE_ID,
  ];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const wanted = wantedVersions.get(id) ?? null;

    let module: vetypes.ModuleInfoExtended | undefined = unmanaged[id];
    if (module !== undefined) {
      const version = versionToString(module.version);
      if (wanted !== null && version !== wanted) {
        wrongVersion.push({
          id,
          name: nameOf(id),
          wanted,
          available: [version],
        });
        continue;
      }
    } else {
      const candidates = staged.get(id) ?? [];
      const picked = pickStagedModule(candidates, wanted);
      if (picked === undefined) {
        if (candidates.length === 0) {
          missing.push({ id, name: nameOf(id) });
        } else {
          wrongVersion.push({
            id,
            name: nameOf(id),
            wanted: wanted ?? "",
            available: candidates.map((candidate) =>
              versionToString(candidate.module.version),
            ),
          });
        }
        continue;
      }
      modIds.add(picked.modId);
      module = picked.module;
    }
    modules.push({ id: module.id, name: module.name });

    queue.push(...getRequiredDependencyIds(module));
  }
  return { modIds: [...modIds], modules, missing, wrongVersion };
};

/**
 * The No Mods profile keeps Server Join and nothing else, not even the mods it depends on
 */
export const limitPlanToServerJoin = (
  plan: IServerProfilePlan,
  mods: Readonly<IBannerlordModStorage>,
): IServerProfilePlan => ({
  modIds: plan.modIds.filter(
    (modId) => mods[modId] !== undefined && isServerJoinMod(mods[modId]),
  ),
  modules: plan.modules.filter((module) => module.id === JOIN_MODULE_ID),
  missing: plan.missing.filter((module) => module.id === JOIN_MODULE_ID),
  wrongVersion: plan.wrongVersion.filter(
    (module) => module.id === JOIN_MODULE_ID,
  ),
});

/**
 * Why a server profile can't be set up from what is installed in Vortex
 */
export const getServerProfileBlockers = (
  plan: IServerProfilePlan | null,
): string[] => {
  if (plan === null) {
    return ["Reading the mods installed in Vortex..."];
  }
  const blockers: string[] = [];
  if (plan.missing.some((module) => module.id === JOIN_MODULE_ID)) {
    blockers.push(getJoinModuleBlocker());
  }
  const missing = plan.missing.filter((module) => module.id !== JOIN_MODULE_ID);
  if (missing.length > 0) {
    blockers.push(
      `Install these mods in Vortex first: ${missing.map((module) => module.name).join(", ")}.`,
    );
  }
  for (const mismatch of plan.wrongVersion) {
    blockers.push(
      `The server needs ${mismatch.name} ${mismatch.wanted}, Vortex has ${mismatch.available.join(", ")}.`,
    );
  }
  return blockers;
};

/**
 * Creates a profile the way Vortex's profile page does, empty unless mod states are given
 */
export const createProfileAsync = async (
  api: types.IExtensionApi,
  name: string,
  features: Record<string, unknown>,
  modState: types.IProfile["modState"] = {},
): Promise<types.IProfile> => {
  const profile: types.IProfile = {
    id: randomBytes(9).toString("base64url"),
    gameId: GAME_ID,
    name,
    modState,
    lastActivated: 0,
    features,
  };
  await fs.mkdir(
    path.join(util.getVortexPath("userData"), GAME_ID, "profiles", profile.id),
    { recursive: true },
  );
  api.store?.dispatch(actions.setProfile(profile));
  return profile;
};

/**
 * Creates an empty profile tied to the server
 */
export const createServerProfileAsync = (
  api: types.IExtensionApi,
  row: IServerRow,
): Promise<types.IProfile> =>
  createProfileAsync(api, getServerProfileName(row), {
    [SERVER_PROFILE_FEATURE]: row.id,
    ...(getServerName(row) !== undefined && {
      [SERVER_NAME_PROFILE_FEATURE]: getServerName(row),
      [DESCRIPTION_PROFILE_FEATURE]: getServerName(row),
    }),
    [MULTIPLAYER_PROFILE_FEATURE]: true,
  });

/**
 * Stores the listed servers' current names on their server profiles, and as their description while it is still the
 * name stored before or empty. A description the user wrote stays
 */
export const syncServerProfileNames = (
  api: types.IExtensionApi,
  profiles: Readonly<Record<string, types.IProfile>>,
  rows: Readonly<Record<string, IServerRow>>,
): void => {
  const updates = Object.values(profiles).flatMap((profile) => {
    const serverId = profile.features?.[SERVER_PROFILE_FEATURE];
    if (profile.gameId !== GAME_ID || typeof serverId !== "string") {
      return [];
    }
    const row = rows[serverId];
    const name = row !== undefined ? getServerName(row) : undefined;
    if (name === undefined) {
      return [];
    }
    const stored = profile.features?.[SERVER_NAME_PROFILE_FEATURE];
    const description = profile.features?.[DESCRIPTION_PROFILE_FEATURE];
    const ownDescription =
      typeof description === "string" &&
      description.trim().length > 0 &&
      description !== stored;
    return [
      ...(stored !== name
        ? [actions.setFeature(profile.id, SERVER_NAME_PROFILE_FEATURE, name)]
        : []),
      ...(!ownDescription && description !== name
        ? [actions.setFeature(profile.id, DESCRIPTION_PROFILE_FEATURE, name)]
        : []),
    ];
  });
  if (updates.length > 0) {
    util.batchDispatch(api.store?.dispatch, updates);
  }
};

/**
 * The name the shared profile for servers without mods gets when it is created, the user can rename it
 */
export const NO_MODS_PROFILE_NAME = "No Mods";

/**
 * Creates the empty profile shared by servers without mods
 */
export const createNoModsProfileAsync = (
  api: types.IExtensionApi,
  name: string,
): Promise<types.IProfile> =>
  createProfileAsync(api, name, {
    [NO_MODS_PROFILE_FEATURE]: true,
    [MULTIPLAYER_PROFILE_FEATURE]: true,
  });

/**
 * Enables the mods in the profile, and their modules in its multiplayer load order, which joining launches.
 * Mods the user enabled there themselves are left alone
 */
export const enableServerModsAsync = async (
  api: types.IExtensionApi,
  profileId: string,
  plan: Pick<IServerProfilePlan, "modIds" | "modules">,
): Promise<void> => {
  await enableModsAsync(api, profileId, plan.modIds);
  await enableInProfileLoadOrderAsync(
    api,
    profileId,
    "multiplayer",
    plan.modules,
  );
};

/**
 * Switches to the specified profile and waits for Vortex to finish deploying it.
 * This can take an arbitrary amount of time because switching deploys both profiles and may await user confirmation.
 * Rejects if Vortex cancels the switch or refuses to initiate it.
 */
export const switchProfileAsync = (
  api: types.IExtensionApi,
  profileId: string,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const store = api.store;
    if (store === undefined) {
      reject(new Error("The Vortex store is not available"));
      return;
    }
    const current = (): { active?: string; next?: string } => {
      const profiles = (store.getState() as types.IState).settings.profiles;
      return { active: profiles.activeProfileId, next: profiles.nextProfileId };
    };
    if (current().active === profileId) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };

    // Vortex clears nextProfileId if the profile switch is cancelled
    const unsubscribe = store.subscribe(() => {
      const { active, next } = current();
      if (active === profileId) {
        finish();
      } else if (next !== profileId) {
        finish(new util.UserCanceled());
      }
    });
    store.dispatch(actions.setNextProfile(profileId));

    // Subscribers execute synchronously during dispatch. If Vortex's sanity checks reject the action,
    // state remains unchanged without emitting notifications, so we detect unstarted switches here.
    const { active, next } = current();
    if (active !== profileId && next !== profileId) {
      finish(new Error("Vortex did not start switching the profile"));
    }
  });

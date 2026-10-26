import { actions, types, util } from "@nexusmods/vortex-api";
import { getJoinModuleBlocker, isServerJoinMod, JOIN_MODULE_ID } from "./join";
import { IClientModuleRequirement } from "./modules";
import { IServerRow } from "./row";
import {
  formatServerAddress,
  sanitizeServerText,
  truncateServerText,
} from "@bannerlord/server-query/address";
import {
  GAME_ID,
  MULTIPLAYER_PROFILE_FEATURE,
  NO_MODS_PROFILE_FEATURE,
  SERVER_PROFILE_FEATURE,
} from "@bannerlord/core/common";
import { versionToString } from "@bannerlord/core/butr/version";
import {
  IBannerlordModStorage,
  IModuleCache,
  IStagedModuleInfo,
} from "@bannerlord/core/types";
import { toStagedModuleInfo } from "@bannerlord/core/vortex/moduleAttributes";
import { createProfileAsync } from "@bannerlord/core/vortex/profiles";
import {
  pickStagedModule,
  StagedModules,
} from "@bannerlord/core/vortex/stagedModules";
// Not the loadOrder index, which reaches the views and through them back here
import { enableInProfileLoadOrderAsync } from "@bannerlord/core/loadOrder/persistence";
import { enableModsAsync } from "@bannerlord/core/vortex/deploy";

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

const PROFILE_NAME_LIMIT = 64;

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
    ? `${truncateServerText(label, PROFILE_NAME_LIMIT - 1)}…`
    : label;
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
 * Picks the Vortex mods that provide the server's required modules, the join module and everything they depend on.
 * The server checks module versions exactly, so a required module is only taken in the version it asks for
 */
export const planServerProfile = (
  requirements: IClientModuleRequirement[],
  staged: StagedModules,
  unmanaged: IModuleCache,
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

    let module: IStagedModuleInfo;
    const unmanagedModule = unmanaged[id];
    if (unmanagedModule !== undefined) {
      const version = versionToString(unmanagedModule.version);
      if (wanted !== null && version !== wanted) {
        wrongVersion.push({
          id,
          name: nameOf(id),
          wanted,
          available: [version],
        });
        continue;
      }
      module = toStagedModuleInfo(unmanagedModule);
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

    queue.push(...module.requiredDependencyIds);
  }
  return { modIds: [...modIds], modules, missing, wrongVersion };
};

/**
 * The No Mods profile keeps Server Join and nothing else, not even the mods it depends on
 */
export const limitPlanToServerJoin = (
  plan: IServerProfilePlan,
  mods: IBannerlordModStorage,
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
  if (updates.length > 0 && api.store !== undefined) {
    util.batchDispatch(api.store.dispatch, updates);
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

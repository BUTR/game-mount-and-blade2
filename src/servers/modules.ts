import {
  INexusModsReference,
  IServerExtensionInfo,
  normalizeModuleVersion,
} from "./extension";
import { types as vetypes } from "@butr/vortexextensionnative";
import { ILobbyModule } from "./lobby";
import { GAME_ID } from "../common";
import { IModuleCache } from "../types";
import { versionToString } from "../butr/version";

/**
 * Constructs a Nexus Mods URL using only validated numeric IDs to ensure links cannot target arbitrary destinations.
 */
export const getNexusModsUrl = (reference: INexusModsReference): string =>
  reference.fileId !== null
    ? `https://www.nexusmods.com/${GAME_ID}/mods/${reference.modId}?tab=files&file_id=${reference.fileId}`
    : `https://www.nexusmods.com/${GAME_ID}/mods/${reference.modId}`;

/**
 * Category value corresponding to `TaleWorlds.ModuleManager.ModuleCategory.MultiplayerOptional`.
 * Modules with this category are advertised by the server, but client presence is optional (`ModuleInfoModel.IsOptional`).
 */
const LOBBY_OPTIONAL_MODULE_CATEGORY = 2;

export const isOptionalLobbyModule = (module: ILobbyModule): boolean =>
  module.Category === LOBBY_OPTIONAL_MODULE_CATEGORY;

/**
 * Installation status of a required module:
 * - installed: Deployed in the active profile with the expected version.
 * - in-vortex: Installed in Vortex with the expected version, but not currently deployed in the active profile.
 * - different-version: Deployed in the active profile, but with a mismatched version.
 * - missing: Not installed in Vortex.
 */
export type RequiredModuleState =
  | "installed"
  | "in-vortex"
  | "different-version"
  | "missing";

/**
 * Module requirement for connecting to a server, merged from lobby server info and server extension metadata.
 */
export interface IClientModuleRequirement {
  id: string;
  name: string;
  /**
   * Expected version string, or `null` if any version is accepted.
   */
  version: string | null;
  required: boolean;
  /**
   * True if advertised by the lobby, which the game client verifies upon joining.
   */
  fromLobby: boolean;
  nexusMods: INexusModsReference | null;
  url: string | null;
}

export interface IClientModuleStatus {
  requirement: IClientModuleRequirement;
  state: RequiredModuleState;
  localVersion: string | null;
}

/**
 * Combines lobby module listings with server extension metadata.
 * The lobby list remains authoritative for module IDs and versions required by the game client,
 * while the server extension augments requirements with download references and optional client-only modules.
 */
export const getClientModuleRequirements = (
  lobbyModules: ILobbyModule[] | null,
  extension: IServerExtensionInfo | null,
): IClientModuleRequirement[] => {
  const extensionModules = new Map(
    (extension?.clientModules ?? []).map((module) => [module.id, module]),
  );

  const fromLobby: IClientModuleRequirement[] = (lobbyModules ?? []).map(
    (module) => {
      const extra = extensionModules.get(module.Id);
      return {
        id: module.Id,
        name: module.Name || extra?.name || module.Id,
        version: normalizeModuleVersion(module.Version) ?? module.Version,
        required: !isOptionalLobbyModule(module),
        fromLobby: true,
        nexusMods: extra?.nexusMods ?? null,
        url: extra?.url ?? null,
      };
    },
  );

  const lobbyIds = new Set(fromLobby.map((module) => module.id));
  const extensionOnly: IClientModuleRequirement[] = [
    ...extensionModules.values(),
  ]
    .filter((module) => !lobbyIds.has(module.id))
    .map((module) => ({
      id: module.id,
      name: module.name ?? module.id,
      version: module.version,
      required: module.required,
      fromLobby: false,
      nexusMods: module.nexusMods,
      url: module.url,
    }));

  return [...fromLobby, ...extensionOnly];
};

/**
 * Evaluates server module requirements against locally installed and staged modules.
 * The game client permits connection only when lobby-advertised modules match by ID and exact version.
 *
 * @param staged Mod modules installed in Vortex regardless of enabled state.
 * When omitted or null, modules not deployed in the current profile are treated as missing.
 */
export const checkClientModules = (
  requirements: IClientModuleRequirement[],
  installed: IModuleCache,
  staged: {
    get: (
      id: string,
    ) => { module: { version: vetypes.ApplicationVersion } }[] | undefined;
  } | null = null,
): IClientModuleStatus[] =>
  requirements.map((requirement) => {
    const matches = (version: string): boolean =>
      requirement.version === null || version === requirement.version;
    const local = installed[requirement.id];
    const localVersion =
      local !== undefined ? versionToString(local.version) : null;
    if (localVersion !== null && matches(localVersion)) {
      return { requirement, state: "installed", localVersion };
    }
    const inVortex = (staged?.get(requirement.id) ?? []).some((candidate) =>
      matches(versionToString(candidate.module.version)),
    );
    if (inVortex) {
      return { requirement, state: "in-vortex", localVersion };
    }
    return {
      requirement,
      state: localVersion !== null ? "different-version" : "missing",
      localVersion,
    };
  });

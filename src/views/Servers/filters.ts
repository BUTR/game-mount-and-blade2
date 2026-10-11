import {
  checkClientModules,
  getClientModuleRequirements,
  IClientModuleRequirement,
} from "../../servers/modules";
import { formatServerAddress } from "../../servers/utils";
import { IServerFilters } from "../../servers/types";
import { IServerRow } from "../../servers/row";
import { isOfficialServer } from "../../servers/join";
import { IModuleCache } from "../../types";

type ServerCheck = Exclude<keyof IServerFilters, "modes">;

/**
 * Resolves required client modules advertised across the lobby list and the BUTR server extension.
 */
export const getRequiredClientModules = (
  row: IServerRow,
): IClientModuleRequirement[] =>
  getClientModuleRequirements(
    row.lobby?.LoadedModules ?? null,
    row.extension?.state === "available" ? (row.extension.info ?? null) : null,
  ).filter((requirement) => requirement.required);

/**
 * Identifies whether a server is verified to run without required client mods:
 * advertised by the lobby or BUTR extension with zero required client modules.
 * Servers with unknown module requirements return false.
 */
export const runsWithoutMods = (row: IServerRow): boolean =>
  (row.lobby !== null || row.extension?.state === "available") &&
  getRequiredClientModules(row).length === 0;

/**
 * Evaluates whether all required server modules are deployed in the local installation;
 * returns null if module requirements or installed mod data have not yet loaded.
 */
export const isReadyToJoin = (
  row: IServerRow,
  installed: Readonly<IModuleCache> | null,
): boolean | null => {
  if (installed === null || (row.lobby === null && row.extension === null)) {
    return null;
  }
  return checkClientModules(getRequiredClientModules(row), installed).every(
    (status) => status.state === "installed",
  );
};

/**
 * Predicate checks corresponding to the Filters popover options (combining in-game browser filters with Vortex-specific checks).
 */
const CHECKS: Record<
  ServerCheck,
  (row: IServerRow, installed: Readonly<IModuleCache> | null) => boolean
> = {
  favorites: (row) => row.favorite,
  hasPlayers: (row) => (row.lobby?.PlayerCount ?? 0) > 0,
  notFull: (row) =>
    row.lobby !== null && row.lobby.PlayerCount < row.lobby.MaxPlayerCount,
  noPassword: (row) => row.lobby?.PasswordProtected !== true,
  community: (row) => row.lobby === null || !isOfficialServer(row.lobby),
  // Pending verification status does not filter out the server.
  readyWithMyMods: (row, installed) => isReadyToJoin(row, installed) !== false,
  // Matches the eligibility criteria for using the shared 'No Mods' profile.
  noModsNeeded: runsWithoutMods,
};

export const SERVER_CHECKS = Object.keys(CHECKS) as ServerCheck[];

export const countActiveFilters = (filters: IServerFilters): number =>
  SERVER_CHECKS.filter((check) => filters[check]).length +
  (filters.modes.length > 0 ? 1 : 0);

/**
 * Case-insensitive search match across visible fields: server name, host name, game mode, map, and address.
 */
const matchesSearch = (row: IServerRow, query: string): boolean =>
  query === "" ||
  [
    row.lobby?.ServerName,
    row.lobby?.HostName,
    row.lobby?.GameType,
    row.lobby?.Map ?? row.probe?.mapList?.currentlyPlaying,
    formatServerAddress(row),
  ].some((value) => value?.toLowerCase().includes(query) === true);

const matches = (
  row: IServerRow,
  filters: IServerFilters,
  query: string,
  installed: Readonly<IModuleCache> | null,
  withModes: boolean,
): boolean =>
  matchesSearch(row, query) &&
  SERVER_CHECKS.every(
    (check) => !filters[check] || CHECKS[check](row, installed),
  ) &&
  (!withModes ||
    filters.modes.length === 0 ||
    filters.modes.includes(row.lobby?.GameType ?? ""));

/**
 * Filters server rows based on active search text and filter criteria.
 * Pinned servers (such as the server for the active profile) are always included.
 */
export const filterServerRows = (
  rows: Readonly<Record<string, IServerRow>>,
  filters: IServerFilters,
  search: string,
  installed: Readonly<IModuleCache> | null,
): Record<string, IServerRow> => {
  const query = search.trim().toLowerCase();
  if (query === "" && countActiveFilters(filters) === 0) {
    return rows;
  }
  return Object.fromEntries(
    Object.entries(rows).filter(
      ([, row]) => row.pinned || matches(row, filters, query, installed, true),
    ),
  );
};

/**
 * Aggregates available game modes for servers matching search and non-mode filters, including server counts per mode.
 * Currently selected game modes are retained to allow deselecting.
 */
export const getModeChoices = (
  rows: Readonly<Record<string, IServerRow>>,
  filters: IServerFilters,
  search: string,
  installed: Readonly<IModuleCache> | null,
): { mode: string; count: number }[] => {
  const query = search.trim().toLowerCase();
  const counts = new Map<string, number>(
    filters.modes.map((mode) => [mode, 0]),
  );
  for (const row of Object.values(rows)) {
    const mode = row.lobby?.GameType;
    if (
      mode !== undefined &&
      mode !== "" &&
      matches(row, filters, query, installed, false)
    ) {
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((lhs, rhs) => lhs[0].localeCompare(rhs[0]))
    .map(([mode, count]) => ({ mode, count }));
};

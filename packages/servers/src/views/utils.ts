import { IServerQueryResult } from "../types";
import { IServerRow } from "../row";
import { parseServerAddress } from "../utils";

/**
 * Identifies the server associated with the active profile and pins it to the top of the list.
 * Injects the server if absent from all query results, ensuring it appears before lobby responses resolve.
 */
export const pinServerRow = (
  rows: Record<string, IServerRow>,
  serverId: string | undefined,
  known: Pick<IServerRow, "probe" | "extension" | "favorite">,
): Record<string, IServerRow> => {
  if (serverId === undefined) {
    return rows;
  }
  const address = parseServerAddress(serverId);
  const pinned: IServerRow | undefined =
    rows[serverId] ??
    (address !== null
      ? {
          id: serverId,
          ...address,
          manual: null,
          lobby: null,
          ...known,
          pinned: false,
        }
      : undefined);
  if (pinned === undefined) {
    return rows;
  }
  const { [serverId]: _pinned, ...others } = rows;
  return { [serverId]: { ...pinned, pinned: true }, ...others };
};

/**
 * Indicates whether the server exposes map listings and BUTR metadata over TCP.
 * This does not reflect game server reachability; lobby servers remain joinable via UDP even without TCP metadata.
 */
export const getStatusText = (
  result: IServerQueryResult,
  t: (key: string) => string,
): string => {
  switch (result.state) {
    case "pending":
      return t("Checking...");
    case "online":
      return t("Available");
    case "unreachable":
      return t("Not published");
    case "invalid":
      return t("Invalid response");
  }
};

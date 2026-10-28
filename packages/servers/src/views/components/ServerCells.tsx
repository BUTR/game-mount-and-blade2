import React, { FC, MouseEvent } from "react";
import { actionsServers } from "../../actions";
import { getClientModuleRequirements } from "../../modules";
import { IServerRow } from "../../row";
import { isOfficialServer } from "../../join";
import { Localize } from "@bannerlord/core/localization/types";

// SVGs for mdiStar and mdiStarOutline from Material Design Icons (@mdi/js, Apache-2.0); Vortex's built-in icon font lacks star icons.
const STAR_PATH =
  "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z";
const STAR_OUTLINE_PATH =
  "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66" +
  "M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z";

/**
 * Renders a favorite toggle button, matching the in-game server browser's star indicator. State is persisted in settings.
 */
export const FavoriteToggle: FC<{
  row: IServerRow;
  dispatch: ((action: unknown) => void) | undefined;
  t: Localize;
}> = ({ row, dispatch, t }) => {
  const label = row.favorite
    ? t("Remove from favorites")
    : t("Add to favorites");
  const onClick = (event: MouseEvent): void => {
    // Toggling favorite does not select the table row.
    event.stopPropagation();
    dispatch?.(actionsServers.setServerFavorite(row.id, !row.favorite));
  };
  return (
    <button
      type="button"
      className={row.favorite ? "bls-star is-favorite" : "bls-star"}
      aria-label={label}
      aria-pressed={row.favorite}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={row.favorite ? STAR_PATH : STAR_OUTLINE_PATH} />
      </svg>
    </button>
  );
};

/**
 * Displays server host information: 'TaleWorlds' for official servers, or the host player's name for community servers.
 */
export const HostCell: FC<{ row: IServerRow; t: Localize }> = ({ row, t }) => {
  if (row.lobby === null) {
    return <></>;
  }
  if (isOfficialServer(row.lobby)) {
    return (
      <span className="bls-host">
        <span className="bls-pill bls-pill-info">{t("Official")}</span>
        <span>{row.lobby.HostName ?? "TaleWorlds"}</span>
      </span>
    );
  }
  return (
    <span className="bls-host">
      <span title={row.lobby.HostName ?? ""}>{row.lobby.HostName ?? ""}</span>
    </span>
  );
};

/**
 * Renders required and optional module counts with an expanded tooltip list mirroring the in-game server browser.
 */
export const ModsCell: FC<{ row: IServerRow; t: Localize }> = ({ row, t }) => {
  const requirements = getClientModuleRequirements(
    row.lobby?.LoadedModules ?? null,
    row.extension?.state === "available" ? (row.extension.info ?? null) : null,
  );
  if (row.lobby === null && requirements.length === 0) {
    return <></>;
  }
  const required = requirements.filter((requirement) => requirement.required);
  const optional = requirements.length - required.length;
  const tooltip = [
    ...requirements.map(
      (requirement) =>
        `${requirement.name} ${requirement.version ?? ""}${requirement.required ? "" : ` ${t("(optional)")}`}`,
    ),
    ...(row.lobby !== null
      ? [
          row.lobby.AllowsOptionalModules
            ? t("This server allows optional modules.")
            : t("This server does not allow optional modules."),
        ]
      : []),
  ].join("\n");
  return (
    <span className="bls-mods" title={tooltip}>
      <span>{required.length}</span>
      {optional > 0 && (
        <span className="bls-muted">
          {t("+{{count}} optional", { count: `${optional}` })}
        </span>
      )}
    </span>
  );
};

/**
 * Displays round-trip latency matching in-game presentation (or '-' if unresponsive).
 * Hosts dropping ICMP echo are timed via TCP connect (badged with 'TCP');
 * hosts unresponsive to both display route-based hop estimates prefixed with '≈'.
 */
export const PingCell: FC<{
  row: IServerRow;
  /**
   * Indicates whether the lobby server list has completed loading prior to ping execution.
   */
  lobbyChecked: boolean;
  t: Localize;
}> = ({ row, lobbyChecked, t }) => {
  const { ping } = row;
  if (ping === undefined && !lobbyChecked) {
    return (
      <span
        className="bls-muted"
        title={t("Measured after fetching the server list")}
      >
        -
      </span>
    );
  }
  if (ping === undefined) {
    return (
      <span className="bls-muted" title={t("Pinging...")}>
        …
      </span>
    );
  }
  if (ping === null) {
    return (
      <span
        className="bls-muted"
        title={t("No response to ping or TCP connection")}
      >
        -
      </span>
    );
  }
  const ms = t("{{ms}} ms", { ms: `${ping.ms}` });
  switch (ping.method) {
    case "tcp":
      return (
        <span
          className="bls-ping"
          title={t(
            "Measured via TCP on port {{port}} (server does not respond to ping)",
            { port: `${row.port}` },
          )}
        >
          <span className="bls-ping-method">{t("TCP")}</span>
          {ms}
        </span>
      );
    case "route":
      return (
        <span
          className="bls-ping"
          title={t(
            "Estimated: Server does not respond to ping or TCP. Showing round-trip time to {{router}} " +
              "(the last reachable hop on its route).",
            { router: ping.via ?? "" },
          )}
        >
          ≈{ms}
        </span>
      );
    case "icmp":
      return <span className="bls-ping">{ms}</span>;
  }
};

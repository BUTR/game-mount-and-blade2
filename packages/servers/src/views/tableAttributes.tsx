import React from "react";
import { tooltip } from "@nexusmods/vortex-api";
import {
  FavoriteToggle,
  HostCell,
  ModsCell,
  PingCell,
} from "./components/ServerCells";
import { StatusView } from "./components/StatusView";
import { getStatusText } from "./utils";
import { formatServerAddress } from "../utils";
import { IServerRow } from "../row";
import { isOptionalLobbyModule } from "../modules";
import {
  ModernTableColumn,
  RowMenu,
  RowMenuItem,
} from "@bannerlord/ui/components/ModernTable";

type Localize = (key: string, values?: Record<string, string>) => string;

export type ServerRowActions = {
  /**
   * Determines whether the quick Join action is enabled for the row, along with any blocker reason.
   */
  getJoin: (row: IServerRow) => { enabled: boolean; reason: string | null };
  onJoin: (row: IServerRow) => void;
  onCheck: (row: IServerRow) => void;
  onRemove: (row: IServerRow) => void;
};

const getServerName = (row: IServerRow): string =>
  row.lobby?.ServerName ?? formatServerAddress(row);

const getServerMap = (row: IServerRow): string =>
  row.lobby?.Map ?? row.probe?.mapList?.currentlyPlaying ?? "";

const Text = ({ value }: { value: string }): JSX.Element => (
  <span className="bls-table-truncate" title={value}>
    {value}
  </span>
);

/**
 * Column definitions for the server browser table.
 *
 * @param lobbyChecked Indicates whether the initial lobby query has completed before pinging servers.
 */
export const getServerColumns = (
  t: Localize,
  dispatch: (action: unknown) => void,
  lobbyChecked: boolean,
): ModernTableColumn<IServerRow>[] => [
  {
    id: "favorite",
    label: t("Favorite"),
    hideLabel: true,
    width: "28px",
    render: (row) => <FavoriteToggle row={row} dispatch={dispatch} t={t} />,
    sortValue: (row) => (row.favorite ? 1 : 0),
    firstDirection: "desc",
  },
  {
    id: "locked",
    label: t("Password"),
    hideLabel: true,
    width: "16px",
    render: (row) =>
      row.lobby?.PasswordProtected ? (
        <tooltip.Icon name="locked" tooltip={t("Password protected")} />
      ) : null,
    sortValue: (row) => (row.lobby?.PasswordProtected ? 1 : 0),
  },
  {
    id: "host",
    toggleable: true,
    label: t("Host"),
    width: "140px",
    render: (row) => <HostCell row={row} t={t} />,
    sortValue: (row) => row.lobby?.HostName ?? null,
  },
  {
    id: "name",
    label: t("Name"),
    width: "minmax(240px, 1fr)",
    render: (row) => (
      <span className="bls-server-name">
        <span title={getServerName(row)}>{getServerName(row)}</span>
        {row.pinned && (
          <span className="bls-pill bls-pill-primary">
            {t("Your server profile")}
          </span>
        )}
        {row.manual !== null && row.lobby === null && (
          <span className="bls-pill">{t("Added by you")}</span>
        )}
      </span>
    ),
    sortValue: getServerName,
  },
  {
    id: "players",
    toggleable: true,
    label: t("Players"),
    width: "100px",
    render: (row) => {
      if (row.lobby === null) {
        return null;
      }
      const { PlayerCount, MaxPlayerCount } = row.lobby;
      const percent =
        MaxPlayerCount > 0
          ? Math.min(100, Math.round((PlayerCount / MaxPlayerCount) * 100))
          : 0;
      return (
        <span className="bls-players">
          <span>
            {PlayerCount} / {MaxPlayerCount}
          </span>
          <span className="bls-meter" aria-hidden="true">
            <span
              className={percent >= 90 ? "is-full" : undefined}
              style={{ width: `${percent}%` }}
            />
          </span>
        </span>
      );
    },
    sortValue: (row) => row.lobby?.PlayerCount ?? null,
    firstDirection: "desc",
  },
  {
    id: "gameType",
    toggleable: true,
    label: t("Mode"),
    width: "130px",
    render: (row) => <Text value={row.lobby?.GameType ?? ""} />,
    sortValue: (row) => row.lobby?.GameType ?? null,
    groupValue: (row) => row.lobby?.GameType ?? null,
  },
  {
    id: "map",
    toggleable: true,
    label: t("Map"),
    width: "150px",
    render: (row) => <Text value={getServerMap(row)} />,
    sortValue: (row) => getServerMap(row) || null,
    groupValue: (row) => getServerMap(row) || null,
  },
  {
    id: "modules",
    toggleable: true,
    label: t("Mods"),
    width: "96px",
    render: (row) => <ModsCell row={row} t={t} />,
    // Sorted by the number of required (non-optional) modules.
    sortValue: (row) =>
      row.lobby?.LoadedModules?.filter(
        (module) => !isOptionalLobbyModule(module),
      ).length ?? null,
    firstDirection: "desc",
  },
  {
    id: "status",
    toggleable: true,
    label: t("Details"),
    width: "112px",
    render: (row) =>
      row.probe !== null ? (
        <StatusView result={row.probe} localize={t} />
      ) : null,
    sortValue: (row) => (row.probe ? getStatusText(row.probe, t) : null),
  },
  {
    id: "ping",
    toggleable: true,
    label: t("Ping"),
    width: "88px",
    align: "end",
    render: (row) => <PingCell row={row} lobbyChecked={lobbyChecked} t={t} />,
    // Unresponsive and unpinged servers sort to the end.
    sortValue: (row) => row.ping?.ms ?? null,
  },
];

/**
 * Action column definition: displays a quick Join button on row hover (matching the Mods table pattern) alongside a context menu.
 */
export const getServerRowActions = (
  t: Localize,
  actions: ServerRowActions,
): {
  label: string;
  width: string;
  render: (row: IServerRow) => JSX.Element;
} => ({
  label: t("Actions"),
  width: "104px",
  render: (row) => {
    const join = actions.getJoin(row);
    const items: RowMenuItem[] = [
      { label: t("Check Again"), onSelect: () => actions.onCheck(row) },
      {
        label: t("Copy Address"),
        onSelect: () => {
          void navigator.clipboard
            ?.writeText(formatServerAddress(row))
            .catch(() => null);
        },
      },
      ...(row.manual !== null
        ? [
            {
              label: t("Remove Server"),
              danger: true,
              onSelect: () => actions.onRemove(row),
            },
          ]
        : []),
    ];
    return (
      <>
        <button
          type="button"
          className="bls-btn bls-btn-moderate bls-row-hover-only bls-row-join"
          disabled={!join.enabled}
          title={join.reason ?? undefined}
          onClick={(event) => {
            event.stopPropagation();
            actions.onJoin(row);
          }}
        >
          {t("Join")}
        </button>
        <RowMenu label={t("More actions")} items={items} />
      </>
    );
  },
});

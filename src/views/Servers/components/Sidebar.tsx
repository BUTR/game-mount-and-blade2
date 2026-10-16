import React, { FC } from "react";
import { Icon, tooltip } from "@nexusmods/vortex-api";
import {
  ActionButton,
  ExternalLink,
  hostOf,
} from "../../Shared/components/Controls";
import {
  checkClientModules,
  getClientModuleRequirements,
  getNexusModsUrl,
  IClientModuleRequirement,
  IClientModuleStatus,
} from "../../../servers/modules";
import { formatServerAddress } from "../../../servers/utils";
import {
  getCollectionPageUrl,
  ICollectionLookup,
  ICollectionRevisionInfo,
  IInstalledCollection,
} from "../../../servers/collections";
import { getJoinUnsupportedReason } from "../../../servers/join";
import { StagedModules } from "../../../servers/profiles";
import {
  IServerExtensionCollection,
  IServerExtensionResult,
} from "../../../servers/extension";
import { IMapDownloadProgress, IServerMapStatus } from "../../../servers/maps";
import { IServerMap } from "../../../servers/types";
import { IServerRow } from "../../../servers/row";
import { IModuleCache } from "../../../types";
import { useLocalization } from "../../../localization/hooks";
import { getStatusText } from "../utils";

type Localize = (key: string, values?: Record<string, string>) => string;

/**
 * Callbacks and state for installing mods advertised on Nexus Mods by the server.
 */
export type SidebarMods = {
  /**
   * Active mod installation tasks keyed by module ID.
   */
  installing: Record<string, true>;
  onInstall: (requirement: IClientModuleRequirement) => Promise<void>;
  /**
   * Modules discovered across all installed Vortex mods (preventing duplicate install prompts for mods deployed in other profiles); null while scanning.
   */
  staged: StagedModules | null;
  /**
   * Enables a staged mod in the active profile, or switches to the server-specific profile if the mod is already enabled there.
   */
  onEnable: (requirement: IClientModuleRequirement) => Promise<void>;
  /**
   * Name of the server-specific profile if it enables the target mod and is not currently active; null otherwise.
   */
  getServerProfileName: (
    requirement: IClientModuleRequirement,
  ) => string | null;
};

export type SidebarCollection = {
  lookup: ICollectionLookup | null;
  installed: IInstalledCollection | null;
  onInstall: (revision: ICollectionRevisionInfo) => Promise<void>;
};

export type SidebarMaps = {
  statuses: IServerMapStatus[];
  /**
   * Indicates whether the local game directory has been scanned to prevent reporting maps as missing prematurely.
   */
  scanned: boolean;
  /**
   * Progress of maps currently downloading or queued.
   */
  downloads: Record<string, IMapDownloadProgress>;
  onDownload: (maps: IServerMap[]) => Promise<void>;
};

export type SidebarJoinOption = {
  /**
   * Reasons preventing connection via this join option, in addition to common blockers.
   */
  blockers: string[];
  onJoin: (row: IServerRow) => Promise<void>;
};

export type SidebarJoin = {
  /**
   * State and actions for the 'Server Join' helper mod required to automate joining from Vortex upon reaching the multiplayer lobby.
   */
  serverJoin: {
    /**
     * Null while scanning installed mods.
     */
    available: boolean | null;
    /**
     * Installed in Vortex but disabled in the current profile (installation action only needs to enable it).
     */
    disabled: boolean;
    installing: boolean;
    url: string;
    onInstall: () => Promise<void>;
  };
  /**
   * Global connection blockers applicable regardless of profile selection; empty if ready to join.
   */
  blockers: string[];
  joining: boolean;
  /**
   * Indicates whether maps are being downloaded prior to launching the game client.
   */
  downloadingMaps: boolean;
  /**
   * Join action using the mods deployed by the currently active profile.
   */
  current: SidebarJoinOption;
  /**
   * Join action using a profile created specifically for this server.
   */
  serverProfile: SidebarJoinOption & {
    /**
     * Name of an existing dedicated profile for this server, or null if none exists.
     */
    name: string | null;
    active: boolean;
  };
  /**
   * Join action using the shared 'No Mods' profile.
   * Null if the server requires mods, already has a dedicated profile, or has unknown mod requirements.
   */
  noModsProfile:
    | (SidebarJoinOption & {
        /**
         * Name of the 'No Mods' profile, or null until initialized on first join.
         */
        name: string | null;
        active: boolean;
        /**
         * Callback to create a dedicated profile for servers allowing optional mods; null if optional mods are disallowed.
         */
        onCreateServerProfile: ((row: IServerRow) => Promise<void>) | null;
      })
    | null;
};

export type SidebarActions = {
  /**
   * Refreshes the server's map list and BUTR extension metadata.
   */
  onCheck: (row: IServerRow) => void;
  /**
   * Removes manually added servers.
   */
  onRemove: (row: IServerRow) => void;
};

export type SidebarProps = {
  row: IServerRow | null;
  installedModules: IModuleCache | null;
  collection: SidebarCollection;
  mods: SidebarMods;
  maps: SidebarMaps;
  actions: SidebarActions;
  join: SidebarJoin;
};

const Stat: FC<{ label: string; value: string; bad?: boolean }> = ({
  label,
  value,
  bad,
}) => (
  <div className="bls-stat">
    <span className="bls-title-xs">{label}</span>
    <span className={bad === true ? "bls-stat-value is-bad" : "bls-stat-value"}>
      {value}
    </span>
  </div>
);

/**
 * Displays an alert listing all blockers preventing connection.
 */
const BlockerAlert: FC<{ blockers: string[]; t: Localize }> = ({
  blockers,
  t,
}) =>
  blockers.length > 0 ? (
    <div className="bls-alert bls-small" role="status">
      <span className="bls-alert-heading">
        <Icon name="feedback-warning" />
        {t("Fix these to join")}
      </span>
      <ul>
        {blockers.map((blocker) => (
          <li key={blocker}>{blocker}</li>
        ))}
      </ul>
    </div>
  ) : null;

/**
 * Displayed in place of join controls for servers Vortex cannot join directly
 * (e.g., official servers or servers disallowing the Server Join helper module).
 */
const JoinFromGameNote: FC<{ reason: string; t: Localize }> = ({
  reason,
  t,
}) => (
  <section className="bls-details-section bls-small">
    <div className="bls-alert bls-alert-info" role="note">
      <span className="bls-alert-heading">
        <Icon name="feedback-info" />
        {t("Join this server from the game")}
      </span>
      <span>{t(reason)}</span>
    </div>
  </section>
);

/**
 * Displayed in place of join controls until the required Server Join mod is installed.
 */
const ServerJoinGate: FC<{ join: SidebarJoin; t: Localize }> = ({
  join,
  t,
}) => {
  const { serverJoin } = join;
  return (
    <section className="bls-details-section bls-small">
      <div className="bls-alert bls-alert-info" role="note">
        <span className="bls-alert-heading">
          <Icon name="feedback-info" />
          {t("Joining from Vortex needs Server Join")}
        </span>
        <span>
          {t(
            "Server Join is a small mod that joins the server for you once the game reaches the multiplayer " +
              "lobby. Install it once, every server uses it.",
          )}
        </span>
      </div>
      <ActionButton
        variant="primary"
        large
        block
        icon={serverJoin.installing ? "spinner" : "download"}
        disabled={serverJoin.installing}
        onClick={() => void serverJoin.onInstall()}
      >
        {serverJoin.installing
          ? t("Installing Server Join...")
          : t("Install Server Join")}
      </ActionButton>
      <ExternalLink url={serverJoin.url} className="bls-external">
        {t("View on Nexus Mods")}
        <Icon name="open-ext" />
      </ExternalLink>
    </section>
  );
};

/**
 * Rendered when Server Join is installed in Vortex but disabled in the active profile.
 */
const EnableServerJoinButton: FC<{ join: SidebarJoin; t: Localize }> = ({
  join,
  t,
}) => {
  const { serverJoin } = join;
  if (!serverJoin.disabled) {
    return null;
  }
  return (
    <ActionButton
      variant="moderate"
      block
      icon={serverJoin.installing ? "spinner" : "toggle-enabled"}
      disabled={serverJoin.installing || join.joining}
      onClick={() => void serverJoin.onInstall()}
    >
      {serverJoin.installing
        ? t("Enabling Server Join...")
        : t("Enable Server Join")}
    </ActionButton>
  );
};

const getBusyLabel = (join: SidebarJoin, t: Localize): string =>
  join.downloadingMaps ? t("Downloading Maps...") : t("Starting Bannerlord...");

/**
 * Displays an informational note below the join button when required maps must be downloaded before launching.
 */
const MapsFirstNote: FC<{ count: number; t: Localize }> = ({ count, t }) =>
  count > 0 ? (
    <p className="bls-muted">
      {count === 1
        ? t("Joining downloads 1 map from the server first.")
        : t("Joining downloads {{count}} maps from the server first.", {
            count: `${count}`,
          })}
    </p>
  ) : null;

/**
 * Why a join button is disabled, for its tooltip: the join already running, or what blocks it
 */
const getDisabledReason = (
  join: SidebarJoin,
  blockers: string[],
  t: Localize,
): string | undefined =>
  join.joining
    ? t("A server is being joined already")
    : blockers.length > 0
      ? blockers.join("\n")
      : undefined;

/**
 * Controls for joining unmodded servers using the shared 'No Mods' profile instead of creating a dedicated profile.
 */
const NoModsJoinSection: FC<{
  row: IServerRow;
  join: SidebarJoin;
  noMods: NonNullable<SidebarJoin["noModsProfile"]>;
  mapsToDownload: number;
  t: Localize;
}> = ({ row, join, noMods, mapsToDownload, t }) => {
  const { current } = join;
  const shared = join.blockers.length > 0 || join.joining;
  const option = noMods.active ? current : noMods;

  return (
    <section className="bls-details-section bls-small">
      <BlockerAlert blockers={[...join.blockers, ...option.blockers]} t={t} />
      {noMods.active && <EnableServerJoinButton join={join} t={t} />}
      <ActionButton
        variant="primary"
        large
        block
        icon={join.joining ? "spinner" : "launch-application"}
        disabled={shared || option.blockers.length > 0}
        title={getDisabledReason(
          join,
          [...join.blockers, ...option.blockers],
          t,
        )}
        onClick={() => void option.onJoin(row)}
      >
        {join.joining
          ? getBusyLabel(join, t)
          : noMods.active
            ? t("Join Server")
            : noMods.name !== null
              ? t("Join with No Mods Profile")
              : t("Set Up No Mods Profile and Join")}
      </ActionButton>
      <p className="bls-muted">
        {noMods.active
          ? t(
              "This server requires no mods. Using the default No Mods profile, {{profile}}.",
              { profile: noMods.name ?? "" },
            )
          : t(
              "This server requires no mods. The default No Mods profile will be used.",
            )}
      </p>
      <MapsFirstNote count={mapsToDownload} t={t} />
      {!noMods.active && (
        <div className="bls-join-option">
          <EnableServerJoinButton join={join} t={t} />
          <ActionButton
            variant="subdued"
            block
            disabled={shared || current.blockers.length > 0}
            title={getDisabledReason(
              join,
              [...join.blockers, ...current.blockers],
              t,
            )}
            onClick={() => void current.onJoin(row)}
          >
            {t("Join with Current Profile")}
          </ActionButton>
          <p className="bls-muted">
            {current.blockers.length > 0
              ? current.blockers.join(" ")
              : t(
                  "Starts the game with the mods your current profile deploys.",
                )}
          </p>
        </div>
      )}
      {noMods.onCreateServerProfile !== null && (
        <div className="bls-join-option">
          <p className="bls-muted">
            {t(
              "This server allows optional mods. Do you want a separate profile created?",
            )}
          </p>
          <ActionButton
            variant="subdued"
            block
            disabled={join.joining}
            title={getDisabledReason(join, [], t)}
            onClick={() => void noMods.onCreateServerProfile?.(row)}
          >
            {t("Create Separate Profile")}
          </ActionButton>
        </div>
      )}
    </section>
  );
};

const JoinSection: FC<{
  row: IServerRow;
  join: SidebarJoin;
  mapsToDownload: number;
  t: Localize;
}> = ({ row, join, mapsToDownload, t }) => {
  const { serverProfile, current } = join;
  const shared = join.blockers.length > 0 || join.joining;
  const startingLabel = getBusyLabel(join, t);

  const unsupported = getJoinUnsupportedReason(row);
  if (unsupported !== null) {
    return <JoinFromGameNote reason={unsupported} t={t} />;
  }

  if (join.serverJoin.available === false) {
    return <ServerJoinGate join={join} t={t} />;
  }

  if (join.noModsProfile !== null && !serverProfile.active) {
    return (
      <NoModsJoinSection
        row={row}
        join={join}
        noMods={join.noModsProfile}
        mapsToDownload={mapsToDownload}
        t={t}
      />
    );
  }

  // The server's dedicated profile is already active; joining via the current profile produces identical results.
  if (serverProfile.active) {
    return (
      <section className="bls-details-section bls-small">
        <BlockerAlert
          blockers={[...join.blockers, ...current.blockers]}
          t={t}
        />
        <EnableServerJoinButton join={join} t={t} />
        <ActionButton
          variant="primary"
          large
          block
          icon={join.joining ? "spinner" : "launch-application"}
          disabled={shared || current.blockers.length > 0}
          title={getDisabledReason(
            join,
            [...join.blockers, ...current.blockers],
            t,
          )}
          onClick={() => void current.onJoin(row)}
        >
          {join.joining ? startingLabel : t("Join Server")}
        </ActionButton>
        <p className="bls-muted">
          {t("Using the server's profile, {{profile}}.", {
            profile: serverProfile.name ?? "",
          })}
        </p>
        <MapsFirstNote count={mapsToDownload} t={t} />
      </section>
    );
  }

  return (
    <section className="bls-details-section bls-small">
      <BlockerAlert
        blockers={[...join.blockers, ...serverProfile.blockers]}
        t={t}
      />
      <ActionButton
        variant="primary"
        large
        block
        icon={join.joining ? "spinner" : "launch-application"}
        disabled={shared || serverProfile.blockers.length > 0}
        title={getDisabledReason(
          join,
          [...join.blockers, ...serverProfile.blockers],
          t,
        )}
        onClick={() => void serverProfile.onJoin(row)}
      >
        {join.joining
          ? startingLabel
          : serverProfile.name !== null
            ? t("Join with Server Profile")
            : t("Create Server Profile and Join")}
      </ActionButton>
      <p className="bls-muted">
        {serverProfile.name !== null
          ? t(
              "Switches to {{profile}}, the profile made for this server, with the mods it needs enabled.",
              { profile: serverProfile.name },
            )
          : t(
              "Creates a profile with only the mods this server needs and switches to it. " +
                "Your current profile is not changed.",
            )}
      </p>
      <MapsFirstNote count={mapsToDownload} t={t} />
      <div className="bls-join-option">
        <EnableServerJoinButton join={join} t={t} />
        <ActionButton
          variant="subdued"
          block
          disabled={shared || current.blockers.length > 0}
          title={getDisabledReason(
            join,
            [...join.blockers, ...current.blockers],
            t,
          )}
          onClick={() => void current.onJoin(row)}
        >
          {t("Join with Current Profile")}
        </ActionButton>
        <p className="bls-muted">
          {current.blockers.length > 0
            ? current.blockers.join(" ")
            : t("Starts the game with the mods your current profile deploys.")}
        </p>
      </div>
    </section>
  );
};

const ModuleStatusIcon: FC<{ status: IClientModuleStatus; t: Localize }> = ({
  status,
  t,
}) => {
  switch (status.state) {
    case "installed":
      return (
        <tooltip.Icon
          name="toggle-enabled"
          className="bls-ok"
          tooltip={t("Installed")}
        />
      );
    case "in-vortex":
      return (
        <tooltip.Icon
          name="toggle-enabled"
          className="bls-warning"
          tooltip={t("Installed in Vortex, not enabled in this profile")}
        />
      );
    case "different-version":
      return (
        <tooltip.Icon
          name="feedback-warning"
          className="bls-warning"
          tooltip={t("Installed version is {{version}}", {
            version: status.localVersion ?? "",
          })}
        />
      );
    case "missing":
      return (
        <tooltip.Icon
          name="toggle-disabled"
          className="bls-danger"
          tooltip={t("Not installed")}
        />
      );
  }
};

const ModuleNote: FC<{ status: IClientModuleStatus; t: Localize }> = ({
  status,
  t,
}) => {
  const version = status.requirement.version ?? t("any version");
  switch (status.state) {
    case "installed":
      return <span className="bls-item-meta">{version}</span>;
    case "in-vortex":
      return (
        <span className="bls-item-meta bls-warning">
          {t("{{version}}, installed in Vortex, not in this profile", {
            version,
          })}
        </span>
      );
    case "different-version":
      return (
        <span className="bls-item-meta bls-warning">
          {t("{{version}} needed, you have {{local}}", {
            version,
            local: status.localVersion ?? "",
          })}
        </span>
      );
    case "missing":
      return (
        <span className="bls-item-meta bls-danger">
          {t("{{version}}, not installed", { version })}
        </span>
      );
  }
};

const ModuleLink: FC<{
  status: IClientModuleStatus;
  mods: SidebarMods;
  t: Localize;
}> = ({ status, mods, t }) => {
  const { requirement } = status;
  // Installed and enabled mods require no action; omit extraneous links.
  if (status.state === "installed") {
    return null;
  }
  if (status.state === "in-vortex") {
    const busy = requirement.id in mods.installing;
    const serverProfile = mods.getServerProfileName(requirement);
    return (
      <span className="bls-item-actions">
        <ActionButton
          variant="subdued"
          icon={
            busy
              ? "spinner"
              : serverProfile !== null
                ? "profile"
                : "toggle-enabled"
          }
          disabled={busy}
          title={
            serverProfile !== null
              ? t("{{mod}} is enabled in {{profile}}, switch to it", {
                  mod: requirement.name,
                  profile: serverProfile,
                })
              : t("Enable {{mod}}, it is installed in Vortex already", {
                  mod: requirement.name,
                })
          }
          onClick={() => void mods.onEnable(requirement)}
        >
          {busy
            ? t("Enabling...")
            : serverProfile !== null
              ? t("Use Server Profile")
              : t("Enable")}
        </ActionButton>
      </span>
    );
  }
  if (requirement.nexusMods !== null) {
    const installing = requirement.id in mods.installing;
    return (
      <span className="bls-item-actions">
        <ActionButton
          variant="subdued"
          icon={installing ? "spinner" : "download"}
          disabled={installing}
          title={t("Download {{mod}} from Nexus Mods, install and enable it", {
            mod: requirement.name,
          })}
          onClick={() => void mods.onInstall(requirement)}
        >
          {installing ? t("Installing...") : t("Install")}
        </ActionButton>
        <ExternalLink
          url={getNexusModsUrl(requirement.nexusMods)}
          label={t("Open {{mod}} on Nexus Mods", { mod: requirement.name })}
          className="bls-btn bls-btn-weak bls-btn-icon"
        >
          <Icon name="nexus" />
        </ExternalLink>
      </span>
    );
  }
  if (requirement.url !== null) {
    return (
      <ExternalLink url={requirement.url} className="bls-external">
        {hostOf(requirement.url)}
        <Icon name="open-ext" />
      </ExternalLink>
    );
  }
  return null;
};

const ModuleList: FC<{
  statuses: IClientModuleStatus[];
  known: boolean;
  mods: SidebarMods;
  t: Localize;
}> = ({ statuses, known, mods, t }) => (
  <ul className="bls-list">
    {statuses.map((status) => (
      <li key={status.requirement.id} className="bls-list-item">
        {known && <ModuleStatusIcon status={status} t={t} />}
        <span className="bls-item-main">
          <span className="bls-item-name" title={status.requirement.id}>
            {status.requirement.name}
          </span>
          {known ? (
            <ModuleNote status={status} t={t} />
          ) : (
            <span className="bls-item-meta">
              {status.requirement.version ?? t("any version")}
            </span>
          )}
        </span>
        {known && <ModuleLink status={status} mods={mods} t={t} />}
      </li>
    ))}
  </ul>
);

const CollectionCard: FC<{
  requested: IServerExtensionCollection;
  collection: SidebarCollection;
  t: Localize;
}> = ({ requested, collection, t }) => {
  const { lookup, installed, onInstall } = collection;
  const revision = lookup?.revision ?? null;

  const heading = requested.required
    ? t("Required collection")
    : t("Recommended collection");

  if (lookup === null || lookup.state === "pending") {
    return (
      <div className="bls-card">
        <span className="bls-title-xs">{heading}</span>
        <span className="bls-muted">
          {t("Looking up '{{slug}}' on Nexus Mods...", {
            slug: requested.slug,
          })}
        </span>
      </div>
    );
  }

  if (revision === null) {
    return (
      <div className="bls-card">
        <span className="bls-title-xs">{heading}</span>
        <span className="bls-danger">
          {lookup.state === "not-found"
            ? t("Nexus Mods has no published collection '{{slug}}'", {
                slug: requested.slug,
              })
            : t("Could not look up the collection: {{error}}", {
                error: lookup.error ?? "",
              })}
        </span>
        <ExternalLink
          url={getCollectionPageUrl(requested.slug)}
          className="bls-external"
        >
          {t("Open on Nexus Mods")}
          <Icon name="open-ext" />
        </ExternalLink>
      </div>
    );
  }

  const isOutdated =
    installed !== null &&
    (installed.revisionNumber ?? 0) < revision.revisionNumber;
  const installText =
    installed === null
      ? t("Install Collection")
      : isOutdated
        ? t("Update to Revision {{revision}}", {
            revision: `${revision.revisionNumber}`,
          })
        : null;

  const meta = [
    revision.author !== null
      ? t("by {{author}}", { author: revision.author })
      : null,
    requested.revision === null
      ? t("revision {{revision}}, the latest", {
          revision: `${revision.revisionNumber}`,
        })
      : t("revision {{revision}}", { revision: `${revision.revisionNumber}` }),
    revision.modCount !== null
      ? t("{{count}} mods", { count: `${revision.modCount}` })
      : null,
  ].filter((part) => part !== null);

  return (
    <div className="bls-card">
      <span className="bls-title-xs">{heading}</span>
      <span className="bls-item-main">
        <ExternalLink
          url={getCollectionPageUrl(revision.slug)}
          className="bls-card-name"
        >
          {revision.name}
        </ExternalLink>
        <span className="bls-muted">{meta.join(" · ")}</span>
      </span>
      {installed !== null && (
        <span className="bls-muted">
          {installed.enabled
            ? t("Installed revision {{revision}}", {
                revision: `${installed.revisionNumber ?? "?"}`,
              })
            : t(
                "Installed revision {{revision}}, but not enabled in this profile",
                { revision: `${installed.revisionNumber ?? "?"}` },
              )}
        </span>
      )}
      {installText !== null && (
        <ActionButton
          variant="moderate"
          onClick={() => void onInstall(revision)}
        >
          {installText}
        </ActionButton>
      )}
    </div>
  );
};

const MapStatusIcon: FC<{ status: IServerMapStatus; t: Localize }> = ({
  status,
  t,
}) => {
  switch (status.state) {
    case "installed":
      return (
        <tooltip.Icon
          name="toggle-enabled"
          className="bls-ok"
          tooltip={t("Installed, matches the server")}
        />
      );
    case "outdated":
      return (
        <tooltip.Icon
          name="feedback-warning"
          className="bls-warning"
          tooltip={t("The server has a different version of this map")}
        />
      );
    case "conflict":
      return (
        <tooltip.Icon
          name="feedback-warning"
          className="bls-danger"
          tooltip={t(
            "The module {{module}} has a different version of this map. The game won't let you join until they match.",
            { module: status.local[0]?.module ?? "" },
          )}
        />
      );
    case "missing":
      return (
        <tooltip.Icon
          name="toggle-disabled"
          className="bls-danger"
          tooltip={t("Not installed")}
        />
      );
  }
};

const formatMegabytes = (bytes: number): string =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const MapProgress: FC<{ progress: IMapDownloadProgress; t: Localize }> = ({
  progress,
  t,
}) => {
  switch (progress.stage) {
    case "queued":
      return <span className="bls-item-progress">{t("Queued")}</span>;
    case "preparing":
      return (
        <span className="bls-item-progress">
          {t("The server is preparing the map...")}
        </span>
      );
    case "installing":
      return <span className="bls-item-progress">{t("Installing...")}</span>;
    case "downloading":
      break;
  }
  const { receivedBytes, totalBytes } = progress;
  if (totalBytes === null) {
    return (
      <span className="bls-item-progress">
        {t("Downloading, {{size}}", { size: formatMegabytes(receivedBytes) })}
      </span>
    );
  }
  const percent = Math.floor((receivedBytes / totalBytes) * 100);
  return (
    <span className="bls-item-progress">
      <span
        className="bls-progress"
        role="progressbar"
        aria-label={t("Download progress")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="bls-progress-text">
        {`${formatMegabytes(receivedBytes)} / ${formatMegabytes(totalBytes)}`}
      </span>
    </span>
  );
};

const MapRowIcon: FC<{
  status: IServerMapStatus;
  progress: IMapDownloadProgress | undefined;
  scanned: boolean;
  t: Localize;
}> = ({ status, progress, scanned, t }) => {
  if (progress !== undefined) {
    return progress.stage === "queued" ? (
      <Icon name="download" className="bls-muted" />
    ) : (
      <Icon name="spinner" className="bls-muted" />
    );
  }
  if (!scanned) {
    return <Icon name="spinner" className="bls-muted" />;
  }
  return <MapStatusIcon status={status} t={t} />;
};

const MapList: FC<{
  currentMap: string | null;
  maps: SidebarMaps;
  t: Localize;
}> = ({ currentMap, maps, t }) => (
  <ul className="bls-list">
    {maps.statuses.map((status) => {
      const { map } = status;
      const progress = maps.downloads[map.name];
      const canDownload =
        maps.scanned &&
        progress === undefined &&
        (status.state === "missing" || status.state === "outdated");
      const current = map.name === currentMap;
      return (
        <li
          key={map.name}
          className={current ? "bls-list-item is-current" : "bls-list-item"}
          title={
            map.uniqueToken !== null
              ? `${t("Token")}: ${map.uniqueToken}
${t("Revision")}: ${map.revision ?? ""}`
              : t("The server did not report a unique identifier")
          }
        >
          <MapRowIcon
            status={status}
            progress={progress}
            scanned={maps.scanned}
            t={t}
          />
          <span className="bls-item-main bls-item-name">{map.name}</span>
          {current && (
            <span className="bls-pill bls-pill-info">{t("Now playing")}</span>
          )}
          {canDownload && (
            <ActionButton
              variant="link"
              onClick={() => void maps.onDownload([map])}
            >
              {status.state === "missing" ? t("Download") : t("Update")}
            </ActionButton>
          )}
          {progress !== undefined && <MapProgress progress={progress} t={t} />}
        </li>
      );
    })}
  </ul>
);

/**
 * Returns maps requiring download (missing or outdated locally) that are not currently downloading.
 */
const getDownloadableMaps = (maps: SidebarMaps): IServerMapStatus[] =>
  maps.scanned
    ? maps.statuses.filter(
        (status) =>
          (status.state === "missing" || status.state === "outdated") &&
          !(status.map.name in maps.downloads),
      )
    : [];

const MapsSection: FC<{
  row: IServerRow;
  currentMap: string | null;
  maps: SidebarMaps;
  t: Localize;
}> = ({ row, currentMap, maps, t }) => {
  const { probe } = row;
  const needed = getDownloadableMaps(maps);

  let note: JSX.Element | null = null;
  if (probe === null) {
    note = <p className="bls-muted">{t("Not checked yet")}</p>;
  } else if (probe.state === "pending") {
    note = <p className="bls-muted">{getStatusText(probe, t)}</p>;
  } else if (probe.state === "unreachable") {
    note = (
      <p className="bls-muted" title={probe.error ?? ""}>
        {t(
          "The server does not answer on TCP port {{port}}, where servers publish their map list and BUTR data. " +
            "The game itself plays over UDP, so this does not stop you from joining.",
          { port: `${row.port}` },
        )}
        {row.lobby === null &&
          ` ${t("If the server runs on this PC, refresh the lobby: once it lists the server, Vortex reaches it here.")}`}
      </p>
    );
  } else if (probe.state === "invalid") {
    note = (
      <p className="bls-danger">
        {getStatusText(probe, t)}
        {probe.error !== null ? `: ${probe.error}` : ""}
      </p>
    );
  } else if (maps.statuses.length === 0) {
    note = (
      <p className="bls-muted">
        {t(
          "The server hosts no custom maps. Its maps come with the game or with its mods.",
        )}
      </p>
    );
  }

  return (
    <section className="bls-details-section bls-small">
      <div className="bls-section-heading">
        <h3 className="bls-title-xs">{t("Custom Maps")}</h3>
        {needed.length > 1 && (
          <ActionButton
            variant="link"
            icon="download"
            onClick={() => void maps.onDownload(needed.map((s) => s.map))}
          >
            {t("Download All ({{count}})", { count: `${needed.length}` })}
          </ActionButton>
        )}
      </div>
      {note}
      {probe?.state === "online" && maps.statuses.length > 0 && (
        <MapList currentMap={currentMap} maps={maps} t={t} />
      )}
    </section>
  );
};

const getExtensionStatusText = (
  extension: IServerExtensionResult | null,
  t: Localize,
): string => {
  switch (extension?.state) {
    case undefined:
      return t("Not checked yet");
    case "pending":
      return t("Checking...");
    case "available":
      return t("Installed (schema {{version}})", {
        version: `${extension.info?.schemaVersion ?? ""}`,
      });
    case "absent":
      return t("Not installed");
    case "unreachable":
      return t("Unknown, no details over TCP");
    case "invalid":
      return t("Invalid response");
  }
};

/**
 * Refresh button to re-query server endpoints (for updating maps or recovering from temporary outages).
 */
const CheckButton: FC<{
  row: IServerRow;
  onCheck: (row: IServerRow) => void;
  t: Localize;
}> = ({ row, onCheck, t }) => {
  const checking = row.probe?.state === "pending";
  const label = checking ? t("Checking...") : t("Check Again");
  return (
    <button
      type="button"
      className="bls-btn bls-btn-subdued bls-btn-icon"
      aria-label={label}
      title={label}
      disabled={checking}
      onClick={() => onCheck(row)}
    >
      <Icon name={checking ? "spinner" : "refresh"} />
    </button>
  );
};

const EmptySidebar: FC<{ t: Localize }> = ({ t }) => (
  <div className="bls-empty bls-small">
    <span className="bls-empty-icon">
      <Icon name="game" />
    </span>
    <h2>{t("Select a server")}</h2>
    <p>{t("Its required mods, custom maps and join options show up here.")}</p>
  </div>
);

export const Sidebar: FC<SidebarProps> = (props) => {
  const {
    row,
    installedModules,
    collection,
    mods,
    maps: mapActions,
    actions,
    join,
  } = props;

  const { localize: t } = useLocalization();

  if (!row) {
    return (
      <aside className="bls-details" aria-label={t("Server details")}>
        <EmptySidebar t={t} />
      </aside>
    );
  }

  const { lobby, probe, extension } = row;
  const info = extension?.state === "available" ? extension.info : null;
  const requirements = getClientModuleRequirements(
    lobby?.LoadedModules ?? null,
    info,
  );
  const knowsInstalled = installedModules !== null;
  const statuses: IClientModuleStatus[] =
    installedModules !== null
      ? checkClientModules(requirements, installedModules, mods.staged)
      : requirements.map((requirement) => ({
          requirement,
          state: "missing",
          localVersion: null,
        }));
  const required = statuses.filter((status) => status.requirement.required);
  const optional = statuses.filter((status) => !status.requirement.required);
  const knowsModules = lobby !== null || info !== null;
  const readyCount = required.filter(
    (status) => status.state === "installed",
  ).length;

  const currentMap = lobby?.Map ?? probe?.mapList?.currentlyPlaying ?? null;
  const mapsToDownload = getDownloadableMaps(mapActions).length;
  const mapsDownloading = mapActions.statuses.filter(
    (status) => status.map.name in mapActions.downloads,
  ).length;
  // Conflicts must be resolved as well; the game client rejects connection if another module supplies a conflicting version.
  const mapsNeeded = mapActions.statuses.filter(
    (status) =>
      status.state !== "installed" &&
      !(status.map.name in mapActions.downloads),
  ).length;

  const name = lobby?.ServerName ?? formatServerAddress(row);
  const subtitle =
    lobby !== null
      ? [lobby.Region, lobby.GameType, lobby.Map]
          .filter((part) => part !== null && part !== undefined && part !== "")
          .join(" · ")
      : row.manual !== null
        ? t("Added by address, not listed in the lobby")
        : formatServerAddress(row);

  const modsStat = !knowsModules
    ? "—"
    : required.length === 0
      ? t("None")
      : knowsInstalled
        ? `${readyCount} / ${required.length}`
        : `${required.length}`;
  const mapsStat =
    probe?.state !== "online"
      ? "—"
      : mapActions.statuses.length === 0
        ? t("None")
        : !mapActions.scanned
          ? "…"
          : mapsNeeded > 0
            ? t("{{count}} needed", { count: `${mapsNeeded}` })
            : mapsDownloading > 0
              ? t("Downloading")
              : t("Ready");

  return (
    <aside className="bls-details" aria-label={t("Server details")}>
      <section className="bls-details-section bls-details-header bls-small">
        <div className="bls-details-title">
          <div>
            <h2>{name}</h2>
            <p className="bls-muted">{subtitle}</p>
          </div>
          <CheckButton row={row} onCheck={actions.onCheck} t={t} />
        </div>
        <div className="bls-stats">
          <Stat
            label={t("Players")}
            value={
              lobby !== null
                ? `${lobby.PlayerCount} / ${lobby.MaxPlayerCount}`
                : "—"
            }
          />
          <Stat
            label={t("Mods")}
            value={modsStat}
            bad={knowsInstalled && readyCount < required.length}
          />
          <Stat
            label={t("Maps")}
            value={mapsStat}
            bad={mapActions.scanned && mapsNeeded > 0}
          />
        </div>
      </section>

      <JoinSection
        row={row}
        join={join}
        mapsToDownload={probe?.state === "online" ? mapsToDownload : 0}
        t={t}
      />

      <section className="bls-details-section bls-small">
        <div className="bls-section-heading">
          <h3 className="bls-title-xs">{t("Required Mods")}</h3>
          {knowsInstalled && required.length > 0 && (
            <span className="bls-muted">
              {t("{{ready}} of {{count}} ready", {
                ready: `${readyCount}`,
                count: `${required.length}`,
              })}
            </span>
          )}
        </div>
        {!knowsModules && (
          <p className="bls-muted">
            {t(
              "Unknown, the server is not listed by the lobby and has no BUTR server extension",
            )}
          </p>
        )}
        {knowsModules && required.length === 0 && (
          <p>{t("This server runs without mods")}</p>
        )}
        {required.length > 0 && (
          <ModuleList
            statuses={required}
            known={knowsInstalled}
            mods={mods}
            t={t}
          />
        )}
        {info?.collection != null && (
          <CollectionCard
            requested={info.collection}
            collection={collection}
            t={t}
          />
        )}
      </section>

      {optional.length > 0 && (
        <section className="bls-details-section bls-small">
          <div className="bls-section-heading">
            <h3 className="bls-title-xs">{t("Optional Mods")}</h3>
            <span className="bls-muted">{optional.length}</span>
          </div>
          <ModuleList
            statuses={optional}
            known={knowsInstalled}
            mods={mods}
            t={t}
          />
        </section>
      )}

      <MapsSection row={row} currentMap={currentMap} maps={mapActions} t={t} />

      <section className="bls-details-section bls-small">
        <h3 className="bls-title-xs">{t("About This Server")}</h3>
        {info?.description != null && (
          <p className="bls-description">{info.description}</p>
        )}
        {info !== null && info.links.length > 0 && (
          <div className="bls-links">
            {info.links.map((link) => (
              <ExternalLink key={link.url} url={link.url}>
                {link.label}
                <span className="bls-muted">{hostOf(link.url)}</span>
              </ExternalLink>
            ))}
          </div>
        )}
        <dl className="bls-facts">
          <dt>{t("Address")}</dt>
          <dd className="bls-address">{formatServerAddress(row)}</dd>
          {lobby && (
            <>
              <dt>{t("Host")}</dt>
              <dd>{lobby.HostName ?? ""}</dd>
              <dt>{t("Region")}</dt>
              <dd>{lobby.Region}</dd>
              <dt>{t("Game Type")}</dt>
              <dd>{lobby.GameType}</dd>
              <dt>{t("Password")}</dt>
              <dd>{lobby.PasswordProtected ? t("Yes") : t("No")}</dd>
              <dt>{t("Optional Mods")}</dt>
              <dd>
                {lobby.AllowsOptionalModules ? t("Allowed") : t("Not allowed")}
              </dd>
            </>
          )}
          <dt>{t("Ping")}</dt>
          <dd>
            {row.ping === undefined
              ? row.lobby === null
                ? t("Pinged once the lobby lists the server")
                : t("Pinging...")
              : row.ping === null
                ? t("No answer")
                : row.ping.method === "tcp"
                  ? t("{{ms}} ms, over TCP, the server doesn't answer ping", {
                      ms: `${row.ping.ms}`,
                    })
                  : row.ping.method === "route"
                    ? t(
                        "About {{ms}} ms, estimated from {{router}}, the last router in the server's network",
                        { ms: `${row.ping.ms}`, router: row.ping.via ?? "" },
                      )
                    : t("{{ms}} ms", { ms: `${row.ping.ms}` })}
          </dd>
          <dt>{t("Checked")}</dt>
          <dd>
            {probe?.checkedAt != null
              ? new Date(probe.checkedAt).toLocaleTimeString()
              : t("Not checked yet")}
            {probe?.endpoint != null &&
              probe.endpoint.address !== row.address &&
              ` · ${t("on this PC, {{address}}", { address: formatServerAddress(probe.endpoint) })}`}
          </dd>
          <dt>{t("BUTR Extension")}</dt>
          <dd title={extension?.error ?? ""}>
            {getExtensionStatusText(extension, t)}
          </dd>
          {info !== null && info.serverModules.length > 0 && (
            <>
              <dt>{t("Server Mods")}</dt>
              <dd>
                {info.serverModules
                  .map((module) =>
                    module.version !== null && module.version !== undefined
                      ? `${module.name ?? module.id} ${module.version}`
                      : (module.name ?? module.id),
                  )
                  .join(", ")}
              </dd>
            </>
          )}
        </dl>
        {row.manual !== null && (
          <ActionButton
            variant="subdued"
            icon="remove"
            className="bls-remove-server"
            onClick={() => actions.onRemove(row)}
          >
            {t("Remove Server")}
          </ActionButton>
        )}
      </section>
    </aside>
  );
};

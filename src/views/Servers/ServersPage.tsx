import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  actions,
  MainContext,
  MainPage,
  selectors,
  types,
  util,
} from "vortex-api";
import { useSelector, useStore } from "react-redux";
import { Content } from "./components/Content";
import { FirstRun } from "./components/FirstRun";
import { MapsTab } from "./components/MapsTab";
import { getServerColumns, getServerRowActions } from "./tableAttributes";
import { pinServerRow } from "./utils";
import { actionsServers } from "../../servers/actions";
import {
  buildJoinArguments,
  getCurrentProfileBlockers,
  getSharedJoinBlockers,
  isGameRunning,
  getJoinUnsupportedReason,
  isServerJoinAvailable,
  checkServerJoinDeploy,
  isServerJoinDisabled,
  setUpServerJoinAsync,
  SERVER_JOIN_URL,
  launchJoinAsync,
  resolveJoinModules,
} from "../../servers/join";
import {
  checkClientModules,
  IClientModuleRequirement,
} from "../../servers/modules";
import {
  createNoModsProfileAsync,
  NO_MODS_PROFILE_NAME,
  createServerProfileAsync,
  enableServerModsAsync,
  findNoModsProfile,
  findServerProfile,
  getServerProfileBlockers,
  getServerProfileName,
  getUnmanagedModules,
  IServerProfilePlan,
  limitPlanToServerJoin,
  pickStagedModule,
  planServerProfile,
  readStagedModulesAsync,
  SERVER_PROFILE_FEATURE,
  syncServerProfileNames,
  StagedModules,
  switchProfileAsync,
} from "../../servers/profiles";
import { isNoModsProfile } from "../../servers/noModsProfile";
import {
  createPendingExtensionResult,
  IServerExtensionResult,
  queryServerExtensionAsync,
} from "../../servers/extension";
import {
  createPendingResult,
  DEFAULT_SERVER_PORT,
  formatServerAddress,
  getServerId,
  parseServerAddress,
} from "../../servers/utils";
import {
  createMapDownloadProgress,
  downloadServerMapAsync,
  getDownloadedMaps,
  getDownloadedMapsPath,
  getServerMapStatuses,
  ILocalScene,
  IMapDownloadProgress,
  LocalScenes,
  readDownloadedScenesAsync,
  readLocalScenesAsync,
  removeDownloadedMapAsync,
  withDownloadedScenes,
} from "../../servers/maps";
import {
  fetchLobbyServersAsync,
  getLastLobbyServerList,
  ILobbyServerList,
  LobbyError,
  pingServersAsync,
  ServerPings,
} from "../../servers/lobby";
import { IServerMap, IServerQueryResult } from "../../servers/types";
import { IServerRow } from "../../servers/row";
import {
  findInstalledCollection,
  isCollectionInstalling,
  getCollectionLookupKey,
  ICollectionLookup,
  ICollectionRevisionInfo,
  installCollectionAsync,
  lookupCollectionAsync,
} from "../../servers/collections";
import { queryLobbyServerAsync, queryServerAsync } from "../../servers/query";
import { requestedCollections, usePageState } from "./pageState";
import { ActionButton } from "../Shared/components/Controls";
import {
  FilterCheckbox,
  FilterGroup,
  DisplayOptionsPopover,
  FilterPopover,
  PopoverGroup,
  PopoverPicker,
  TableToolbar,
  ToolbarSearch,
  ToolbarViews,
} from "../Shared/components/TableToolbar";
import { ModernPageHeader } from "../Shared/components/ModernPageHeader";
import {
  ColumnToggles,
  useColumnVisibility,
} from "../Shared/components/ColumnToggles";
import { NoMatches } from "../Shared/components/NoMatches";
import {
  createTableGrouping,
  TableGrouping,
  TableSort,
} from "../Shared/components/ModernTable";
import {
  countActiveFilters,
  filterServerRows,
  getModeChoices,
  getRequiredClientModules,
  runsWithoutMods,
  SERVER_CHECKS,
} from "./filters";
import { GAME_ID, MULTIPLAYER_PROFILE_FEATURE } from "../../common";
import { useLocalization } from "../../localization/hooks";
import { VortexLauncherManager } from "../../launcher/manager";
import { DeployModStatus } from "../../blse/modDeploy";
import { downloadAndEnableModFileAsync } from "../../vortex/modDownloader";
import { enableModsAsync, ensureModsDeployedAsync } from "../../vortex/deploy";
import {
  enableInProfileLoadOrderAsync,
  readProfileLoadOrderAsync,
} from "../../loadOrder/persistence";
import { reloadLoadOrderAsync } from "../../loadOrder/gameMode";
import { bselectors } from "../../selectors";
import { IModuleCache, IStateWithBannerlord } from "../../types";

/**
 * Why the current profile can't take a server's mods or collection, null when it can: the No Mods profile stays
 * without mods, a Singleplayer profile doesn't join servers, and another server's profile is kept to that server's mods
 */
const getCurrentProfileRefusal = (
  state: IStateWithBannerlord,
  current: types.IProfile | undefined,
  row: IServerRow,
): "none" | "no-mods" | "singleplayer" | "other-server" | null => {
  if (current === undefined) {
    return "none";
  }
  if (isNoModsProfile(current)) {
    return "no-mods";
  }
  if (bselectors.gameModeForProfile(state, current.id) !== "multiplayer") {
    return "singleplayer";
  }
  const serverId = current.features?.[SERVER_PROFILE_FEATURE];
  if (serverId !== undefined && serverId !== row.id) {
    return "other-server";
  }
  return null;
};

const SINGLEPLAYER_PROFILE_BLOCKER =
  "The active profile is a Singleplayer profile. Servers are joined with Multiplayer profiles, switch to one on the Profiles page";

// How often the player can ping every server again by hand
const PING_COOLDOWN_MS = 10_000;

// The server table columns the servers can be grouped by, null for no grouping
type ServerGroupBy = "gameType" | "map" | null;
const SERVER_GROUP_BY: ServerGroupBy[] = [null, "gameType", "map"];

export const ServersPage: FC = () => {
  const context = useContext(MainContext);
  const api = context.api;

  const { localize: t } = useLocalization();

  const store = useStore();
  const manualServers = useSelector(bselectors.servers);
  const favoriteServers = useSelector(bselectors.favoriteServers);
  // Servers are joined with Multiplayer profiles, a Singleplayer one only browses them
  const isMultiplayer = useSelector(
    (state: IStateWithBannerlord) =>
      bselectors.activeGameMode(state) === "multiplayer",
  );
  const mods = useSelector(
    (state: IStateWithBannerlord) => state.persistent.mods[GAME_ID],
  );
  const profile = useSelector(selectors.activeProfile);
  const [collectionLookups, setCollectionLookups] = usePageState<
    Record<string, ICollectionLookup>
  >("collectionLookups", {});

  const [lobbyServerList, setLobbyServerList] =
    usePageState<ILobbyServerList | null>(
      "lobbyServerList",
      getLastLobbyServerList,
    );
  const [lobbyLoading, setLobbyLoading] = usePageState("lobbyLoading", false);
  const [probes, setProbes] = usePageState<Record<string, IServerQueryResult>>(
    "probes",
    {},
  );
  const [extensions, setExtensions] = usePageState<
    Record<string, IServerExtensionResult>
  >("extensions", {});
  const [installedModules, setInstalledModules] =
    useState<Readonly<IModuleCache> | null>(null);
  const [selectedId, setSelectedId] = usePageState<string | null>(
    "selectedId",
    null,
  );
  const [activeTab, setActiveTab] = usePageState<"servers" | "maps">(
    "activeTab",
    "servers",
  );
  // The column the servers are grouped by, set from Display options or the Modes / Maps views
  const [groupBy, setGroupBy] = usePageState<ServerGroupBy>("groupBy", null);
  // The collapsed groups of each column
  const [collapsedGroups, setCollapsedGroups] = usePageState<
    Record<string, string[]>
  >("collapsedGroups", {});

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // The server the active profile was made for
  const profileServerId =
    profile?.gameId === GAME_ID
      ? (profile.features?.[SERVER_PROFILE_FEATURE] as string | undefined)
      : undefined;

  // Pings by server id. Kept with the page state, so reopening the page doesn't ping again
  const [pings, setPings] = usePageState<ServerPings>("pings", {});

  const rows = useMemo(() => {
    const rows: Record<string, IServerRow> = {};
    for (const server of lobbyServerList?.servers ?? []) {
      const id = getServerId({ address: server.Address, port: server.Port });
      rows[id] = {
        id,
        address: server.Address,
        port: server.Port,
        manual: null,
        lobby: server,
        probe: probes[id] ?? null,
        extension: extensions[id] ?? null,
        pinned: false,
        favorite: favoriteServers[id] === true,
      };
    }
    for (const entry of Object.values(manualServers)) {
      rows[entry.id] = {
        id: entry.id,
        address: entry.address,
        port: entry.port,
        manual: entry,
        lobby: rows[entry.id]?.lobby ?? null,
        probe: probes[entry.id] ?? null,
        extension: extensions[entry.id] ?? null,
        pinned: false,
        favorite: favoriteServers[entry.id] === true,
      };
    }

    // Listed even when the lobby has not been checked yet, and first so the table shows it at the top
    const pinned = pinServerRow(
      rows,
      profileServerId,
      profileServerId !== undefined
        ? {
            probe: probes[profileServerId] ?? null,
            extension: extensions[profileServerId] ?? null,
            favorite: favoriteServers[profileServerId] === true,
          }
        : { probe: null, extension: null, favorite: false },
    );
    for (const row of Object.values(pinned)) {
      row.ping = pings[row.id];
    }
    return pinned;
  }, [
    lobbyServerList,
    manualServers,
    favoriteServers,
    probes,
    extensions,
    profileServerId,
    pings,
  ]);

  // Every listed server is pinged once, in one bridge run, like the game's server list does. A lobby refresh
  // clears the pings, so the whole list is pinged again
  // Nothing is pinged until the lobby has listed the servers
  const pingingRef = useRef(new Set<string>());
  useEffect(() => {
    if (lobbyServerList === null) {
      return;
    }
    const unpinged = Object.values(rows).filter(
      (row) => !(row.id in pings) && !pingingRef.current.has(row.id),
    );
    if (unpinged.length === 0) {
      return;
    }
    for (const row of unpinged) {
      pingingRef.current.add(row.id);
    }
    void pingServersAsync(api, unpinged)
      .then((result) => setPings((previous) => ({ ...previous, ...result })))
      .finally(() => {
        for (const row of unpinged) {
          pingingRef.current.delete(row.id);
        }
      });
  }, [api, lobbyServerList, rows, pings, setPings]);

  // Pinging every server again by hand, at most once per PING_COOLDOWN_MS from when the last run's results came in
  const [manualPing, setManualPing] = usePageState<{
    running: boolean;
    finishedAt: number | null;
  }>("manualPing", { running: false, finishedAt: null });
  const [now, setNow] = useState(() => Date.now());
  const cooldownLeftMs =
    !manualPing.running && manualPing.finishedAt !== null
      ? Math.max(0, manualPing.finishedAt + PING_COOLDOWN_MS - now)
      : 0;
  // Ticks only while the countdown is shown
  useEffect(() => {
    if (cooldownLeftMs === 0) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownLeftMs]);

  const pingAllAsync = useCallback(async (): Promise<void> => {
    if (
      lobbyServerList === null ||
      manualPing.running ||
      (manualPing.finishedAt !== null &&
        Date.now() < manualPing.finishedAt + PING_COOLDOWN_MS)
    ) {
      return;
    }
    const targets = Object.values(rows);
    if (targets.length === 0) {
      return;
    }
    setManualPing({ running: true, finishedAt: manualPing.finishedAt });
    for (const row of targets) {
      pingingRef.current.add(row.id);
    }
    try {
      // The old times stay until the new ones are in
      const result = await pingServersAsync(api, targets);
      setPings((previous) => ({ ...previous, ...result }));
    } finally {
      for (const row of targets) {
        pingingRef.current.delete(row.id);
      }
      // The cooldown starts once the results are in
      const finishedAt = Date.now();
      setNow(finishedAt);
      setManualPing({ running: false, finishedAt });
    }
  }, [api, lobbyServerList, rows, manualPing, setManualPing, setPings]);

  // The Mode column's filter reads the rows when it is opened, so its choices follow lobby refreshes

  /**
   * Reads what the server publishes on its web host: the vanilla map list and the BUTR server extension data
   */
  const probeAsync = useCallback(
    async (targets: IServerRow[]): Promise<void> => {
      setProbes((previous) => {
        const next = { ...previous };
        for (const target of targets) {
          next[target.id] = createPendingResult();
        }
        return next;
      });
      setExtensions((previous) => {
        const next = { ...previous };
        for (const target of targets) {
          next[target.id] = createPendingExtensionResult();
        }
        return next;
      });

      await Promise.all(
        targets.map(async (target) => {
          const probe =
            target.lobby !== null
              ? await queryLobbyServerAsync(target, target.lobby.Map)
              : await queryServerAsync(target);
          setProbes((previous) => ({ ...previous, [target.id]: probe }));
          // Asked where the map list answered, which is this PC for a server hosted here
          const extension = await queryServerExtensionAsync(
            probe.state === "online" && probe.endpoint !== null
              ? probe.endpoint
              : target,
          );
          setExtensions((previous) => ({
            ...previous,
            [target.id]: extension,
          }));
        }),
      );
    },
    [setProbes, setExtensions],
  );

  const refreshInstalledModulesAsync = useCallback(async (): Promise<void> => {
    try {
      const modules =
        await VortexLauncherManager.getInstance(api).getAllModulesAsync();
      if (isMounted.current) {
        setInstalledModules(modules);
      }
    } catch (err) {
      api.showErrorNotification?.(t("Failed to read installed modules"), err);
    }
  }, [api, t]);

  useEffect(() => {
    void refreshInstalledModulesAsync();
  }, [refreshInstalledModulesAsync]);

  // Servers added by hand have no lobby data, so their map list is checked right away
  useEffect(() => {
    const unchecked = Object.values(rows).filter(
      (row) => row.manual !== null && row.probe === null,
    );
    if (unchecked.length > 0) {
      void probeAsync(unchecked);
    }
  }, [rows, probeAsync]);

  // A server that didn't answer before the lobby listed it, the server profile's or one added by address, is checked
  // again with the lobby's data: a server hosted on this PC is only reached through it
  useEffect(() => {
    const recheck = Object.values(rows).filter(
      (row) =>
        row.lobby !== null &&
        row.probe?.state === "unreachable" &&
        !row.probe.withLobby,
    );
    if (recheck.length > 0) {
      void probeAsync(recheck);
    }
  }, [rows, probeAsync]);

  // Lobby servers are checked when selected, instead of contacting every listed host
  const selectedRow = selectedId !== null ? (rows[selectedId] ?? null) : null;
  useEffect(() => {
    if (selectedRow !== null && selectedRow.probe === null) {
      void probeAsync([selectedRow]);
    }
  }, [selectedRow, probeAsync]);

  // When a server specifying a Nexus Mods collection is selected, look up that collection once.
  // If the lookup was not found, retry on subsequent selections or checks, as Vortex reports
  // network errors and API rate limits identically to not-found responses.
  const selectedCollection = selectedRow?.extension?.info?.collection ?? null;
  const selectedCollectionKey =
    selectedCollection !== null
      ? getCollectionLookupKey(selectedCollection)
      : null;
  useEffect(() => {
    if (
      selectedCollection === null ||
      selectedCollectionKey === null ||
      requestedCollections.has(selectedCollectionKey)
    ) {
      return;
    }
    requestedCollections.add(selectedCollectionKey);
    void lookupCollectionAsync(api, selectedCollection).then((lookup) => {
      if (lookup.state !== "found") {
        requestedCollections.delete(selectedCollectionKey);
      }
      setCollectionLookups((previous) => ({
        ...previous,
        [selectedCollectionKey]: lookup,
      }));
    });
  }, [api, selectedCollection, selectedCollectionKey, setCollectionLookups]);

  const selectedCollectionLookup =
    selectedCollectionKey !== null
      ? (collectionLookups[selectedCollectionKey] ?? null)
      : null;
  const installedCollection =
    selectedCollection !== null
      ? findInstalledCollection(mods, profile, selectedCollection.slug)
      : null;

  // Custom maps: the selected server's map host, compared with the scenes in the game folder
  const gamePath = useSelector(
    (state: IStateWithBannerlord) =>
      selectors.discoveryByGame(state, GAME_ID)?.path,
  );
  // Kept with the page state, so a remount doesn't show every map as missing until the folders are read again
  const [localScenes, setLocalScenes] = usePageState<LocalScenes | null>(
    "localScenes",
    null,
  );
  const [mapDownloads, setMapDownloads] = usePageState<
    Record<string, IMapDownloadProgress>
  >("mapDownloads", {});
  const refreshLocalScenesAsync = useCallback(async (): Promise<void> => {
    if (gamePath === undefined) {
      return;
    }
    // The download cache first, so the Maps tab doesn't wait for the scenes of every other module
    const downloaded = await readDownloadedScenesAsync(gamePath);
    setLocalScenes((previous) => withDownloadedScenes(previous, downloaded));
    setLocalScenes(await readLocalScenesAsync(gamePath, downloaded));
  }, [gamePath, setLocalScenes]);
  useEffect(() => {
    void refreshLocalScenesAsync();
  }, [refreshLocalScenesAsync]);

  const selectedMaps = selectedRow?.probe?.mapList?.maps;
  const mapStatuses = useMemo(
    () =>
      selectedMaps !== undefined
        ? getServerMapStatuses(selectedMaps, localScenes)
        : [],
    [selectedMaps, localScenes],
  );

  const setMapDownload = useCallback(
    (name: string, progress: IMapDownloadProgress | undefined) => {
      setMapDownloads((previous) => {
        const next = { ...previous };
        if (progress === undefined) {
          delete next[name];
        } else {
          next[name] = progress;
        }
        return next;
      });
    },
    [setMapDownloads],
  );

  // Read by joining, which runs longer than a render
  const mapDownloadsRef = useRef(mapDownloads);
  mapDownloadsRef.current = mapDownloads;

  /**
   * Downloads maps from the server one at a time, the server zips each map on request.
   * Returns the maps that failed with why, the caller decides how to report them
   */
  const downloadServerMapsAsync = useCallback(
    async (
      row: IServerRow,
      maps: IServerMap[],
    ): Promise<{ map: IServerMap; error: unknown }[]> => {
      if (gamePath === undefined) {
        return [];
      }
      // Where the map list answered, which is this PC for a server hosted here
      const server = row.probe?.endpoint ?? {
        address: row.address,
        port: row.port,
      };
      // A map already downloading or waiting its turn is not asked for twice
      const queued = maps.filter(
        (map) => !(map.name in mapDownloadsRef.current),
      );
      for (const map of queued) {
        setMapDownload(map.name, createMapDownloadProgress("queued"));
      }
      const failed: { map: IServerMap; error: unknown }[] = [];
      for (const map of queued) {
        try {
          await downloadServerMapAsync(gamePath, server, map, (progress) =>
            setMapDownload(map.name, progress),
          );
        } catch (error) {
          failed.push({ map, error });
        }
        // Read again before the progress goes away, or the map shows as missing until the read finishes.
        // Only the download cache changed, the other modules' scenes are kept
        try {
          const downloaded = await readDownloadedScenesAsync(gamePath);
          setLocalScenes((previous) =>
            withDownloadedScenes(previous, downloaded),
          );
        } finally {
          setMapDownload(map.name, undefined);
        }
      }
      return failed;
    },
    [gamePath, setMapDownload, setLocalScenes],
  );

  const downloadMapsAsync = useCallback(
    async (maps: IServerMap[]): Promise<void> => {
      if (selectedRow === null) {
        return;
      }
      const failed = await downloadServerMapsAsync(selectedRow, maps);
      for (const { map, error } of failed) {
        api.showErrorNotification?.(
          t("Failed to download the map {{map}}", { map: map.name }),
          error,
          { allowReport: false },
        );
      }
    },
    [api, t, selectedRow, downloadServerMapsAsync],
  );

  const removeMapAsync = useCallback(
    async (scene: ILocalScene): Promise<void> => {
      if (gamePath === undefined) {
        return;
      }
      const removeLabel = t("Remove");
      const result = await api.showDialog?.(
        "question",
        t("Remove Map"),
        {
          text: t(
            "Remove the downloaded map {{map}}? Servers that use it will offer to download it again.",
            { map: scene.name },
          ),
        },
        [{ label: t("Cancel") }, { label: removeLabel }],
      );
      if (result?.action !== removeLabel) {
        return;
      }
      try {
        await removeDownloadedMapAsync(gamePath, scene);
      } catch (err) {
        api.showErrorNotification?.(t("Failed to remove the map"), err, {
          allowReport: false,
        });
      }
      await refreshLocalScenesAsync();
    },
    [api, t, gamePath, refreshLocalScenesAsync],
  );

  // Joining: the game started in multiplayer with the server's modules, the join module does the rest in the lobby
  const gameStore = useSelector(
    (state: IStateWithBannerlord) =>
      selectors.discoveryByGame(state, GAME_ID)?.store,
  );
  const gameRunning = useSelector(isGameRunning);
  const [joining, setJoining] = usePageState("joining", false);
  const [joiningMaps, setJoiningMaps] = usePageState("joiningMaps", false);

  const getRequiredStatuses = useCallback(
    (row: IServerRow, modules: Readonly<IModuleCache>) =>
      checkClientModules(getRequiredClientModules(row), modules),
    [],
  );

  // A profile per server, built from the mods installed in Vortex whether the current profile enables them or not
  const stagingPath = useSelector((state: IStateWithBannerlord) =>
    selectors.installPathForGame(state, GAME_ID),
  );
  const profiles = useSelector(
    (state: IStateWithBannerlord) => state.persistent.profiles,
  );
  // Server profiles keep the name of their server, which can be renamed
  useEffect(() => {
    syncServerProfileNames(api, profiles, rows);
  }, [api, profiles, rows]);
  const [stagedModules, setStagedModules] = useState<StagedModules | null>(
    null,
  );
  useEffect(() => {
    if (stagingPath === undefined) {
      return;
    }
    let current = true;
    void readStagedModulesAsync(stagingPath, mods ?? {}).then((staged) => {
      if (current && isMounted.current) {
        setStagedModules(staged);
      }
    });
    return () => {
      current = false;
    };
  }, [stagingPath, mods]);

  // Joining needs Server Join, so without it the page offers to install it instead of the join buttons
  const serverJoinAvailable = isServerJoinAvailable(
    mods,
    installedModules,
    stagedModules,
  );
  // Server Join can be installed in Vortex and only disabled in the current profile, which needs enabling, not
  // installing. A download that is already there is installed instead of downloaded again
  const serverJoinDisabled =
    profile !== undefined &&
    checkServerJoinDeploy(api, profile, mods ?? {}).status ===
      DeployModStatus.NOT_ENABLED;
  const [installingServerJoin, setInstallingServerJoin] = usePageState(
    "installingServerJoin",
    false,
  );
  const installServerJoinAsync = useCallback(async (): Promise<void> => {
    if (installingServerJoin) {
      return;
    }
    setInstallingServerJoin(true);
    try {
      await api.ext?.ensureLoggedIn?.();
      await setUpServerJoinAsync(api);
      await refreshInstalledModulesAsync();
    } catch (err) {
      if (!(err instanceof util.UserCanceled)) {
        api.showErrorNotification?.(t("Failed to install Server Join"), err);
        util.opn(SERVER_JOIN_URL).catch(() => null);
      }
    } finally {
      setInstallingServerJoin(false);
    }
  }, [
    api,
    t,
    installingServerJoin,
    setInstallingServerJoin,
    refreshInstalledModulesAsync,
  ]);

  const serverProfile =
    selectedRow !== null
      ? findServerProfile(profiles, selectedRow.id)
      : undefined;
  const noModsProfile = findNoModsProfile(profiles);

  const profilePlan = useMemo<IServerProfilePlan | null>(
    () =>
      selectedRow !== null &&
      stagedModules !== null &&
      installedModules !== null
        ? planServerProfile(
            getRequiredClientModules(selectedRow),
            stagedModules,
            getUnmanagedModules(installedModules, mods ?? {}),
          )
        : null,
    [selectedRow, stagedModules, installedModules, mods],
  );

  const sharedJoinBlockers = useMemo(
    () =>
      selectedRow !== null
        ? getSharedJoinBlockers(selectedRow, {
            store: gameStore,
            gamePath,
            gameRunning,
          })
        : [],
    [selectedRow, gameStore, gamePath, gameRunning],
  );
  const currentProfileBlockers = useMemo(
    () =>
      selectedRow !== null
        ? [
            ...(isMultiplayer ? [] : [t(SINGLEPLAYER_PROFILE_BLOCKER)]),
            ...getCurrentProfileBlockers(
              installedModules,
              installedModules !== null
                ? getRequiredStatuses(selectedRow, installedModules)
                : [],
              serverJoinDisabled,
            ),
          ]
        : [],
    [
      t,
      selectedRow,
      installedModules,
      getRequiredStatuses,
      serverJoinDisabled,
      isMultiplayer,
    ],
  );
  const serverProfileBlockers = useMemo(
    () => getServerProfileBlockers(profilePlan),
    [profilePlan],
  );
  const noModsProfileBlockers = useMemo(
    () =>
      getServerProfileBlockers(
        profilePlan !== null
          ? limitPlanToServerJoin(profilePlan, mods ?? {})
          : null,
      ),
    [profilePlan, mods],
  );

  const showJoinBlockers = useCallback(
    (blockers: string[]) =>
      api.showErrorNotification?.(
        t("Can't join the server yet"),
        blockers.join(" "),
        { allowReport: false },
      ),
    [api, t],
  );

  /**
   * Downloads the server's custom maps the game folder doesn't have, or has in another version, before joining.
   * The game won't join until it has them. Returns whether the game can be started
   */
  const downloadMapsForJoinAsync = useCallback(
    async (row: IServerRow): Promise<boolean> => {
      const maps =
        row.probe?.state === "online" ? (row.probe.mapList?.maps ?? []) : [];
      if (maps.length === 0 || gamePath === undefined) {
        return true;
      }
      // Read now, the page's copy can be older than the game folder
      const scenes = await readLocalScenesAsync(gamePath);
      setLocalScenes(scenes);
      // A map another module has in a different version can't be fixed by downloading, the game says so itself
      const needed = getServerMapStatuses(maps, scenes)
        .filter(
          (status) => status.state === "missing" || status.state === "outdated",
        )
        .map((status) => status.map);
      if (needed.length === 0) {
        return true;
      }
      // One already on its way may not be done when the game starts
      if (needed.some((map) => map.name in mapDownloadsRef.current)) {
        showJoinBlockers([
          t("Wait for the maps that are downloading to finish, then join."),
        ]);
        return false;
      }

      setJoiningMaps(true);
      let failed: { map: IServerMap; error: unknown }[];
      try {
        failed = await downloadServerMapsAsync(row, needed);
      } finally {
        setJoiningMaps(false);
      }
      if (failed.length > 0) {
        api.showErrorNotification?.(
          t("Can't join the server yet"),
          [
            t("These maps could not be downloaded:"),
            ...failed.map(
              ({ map, error }) =>
                `- ${map.name}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          ].join("\n"),
          { allowReport: false },
        );
        return false;
      }
      return true;
    },
    [
      api,
      t,
      gamePath,
      setLocalScenes,
      setJoiningMaps,
      showJoinBlockers,
      downloadServerMapsAsync,
    ],
  );

  /**
   * Deploys the active profile, downloads the server's maps and starts the game with the server's modules
   */
  const startGameForServerAsync = useCallback(
    async (row: IServerRow): Promise<void> => {
      if (gamePath === undefined) {
        return;
      }
      // Every join launches through here, never with a Singleplayer profile
      if (bselectors.activeGameMode(api.getState()) !== "multiplayer") {
        showJoinBlockers([t(SINGLEPLAYER_PROFILE_BLOCKER)]);
        return;
      }
      // Checked before deploying, which would rewrite the Modules folder under a running game
      const sharedBlockers = getSharedJoinBlockers(row, {
        store: gameStore,
        gamePath,
        gameRunning: isGameRunning(api.getState()),
      });
      if (sharedBlockers.length > 0) {
        showJoinBlockers(sharedBlockers);
        return;
      }

      // The game signs into the lobby through the store client. Starting the store client now gives it time
      // to initialize while mod deployment completes.
      if (gameStore !== undefined) {
        void util.GameStoreHelper.launchGameStore(api, gameStore).catch(
          () => null,
        );
      }

      // Ensure all enabled mods are deployed to disk before reading the module list
      await ensureModsDeployedAsync(api);
      const launcherManager = VortexLauncherManager.getInstance(api);
      await launcherManager.refreshModulesAsync();
      const modules = await launcherManager.getAllModulesAsync();
      if (isMounted.current) {
        setInstalledModules(modules);
      }

      const required = getRequiredStatuses(row, modules);
      // The profile can have changed since this was rendered, a join switches to the server's profile first
      const blockers = getCurrentProfileBlockers(
        modules,
        required,
        isServerJoinDisabled(api),
      );
      if (blockers.length > 0) {
        showJoinBlockers(blockers);
        return;
      }

      if (!(await downloadMapsForJoinAsync(row))) {
        return;
      }

      // What the player enabled for multiplayer on the Load Order page goes along, optional mods included.
      // Not to a server that refuses optional modules, it would turn the player away for them
      const activeProfileId = selectors.activeProfile(api.getState())?.id;
      const loadOrder =
        activeProfileId !== undefined &&
        row.lobby?.AllowsOptionalModules !== false
          ? await readProfileLoadOrderAsync(api, activeProfileId, "multiplayer")
          : [];
      const resolved = resolveJoinModules(
        required.map((status) => status.requirement.id),
        modules,
        [...loadOrder]
          .sort((lhs, rhs) => lhs.index - rhs.index)
          .filter((entry) => entry.isSelected)
          .map((entry) => entry.id),
      );
      if (resolved.missing.length > 0) {
        showJoinBlockers([
          t("These modules are needed but not installed: {{modules}}", {
            modules: resolved.missing.join(", "),
          }),
        ]);
        return;
      }

      const started = await launchJoinAsync(
        api,
        gamePath,
        gameStore,
        buildJoinArguments(resolved.modules, row),
      );
      if (!started) {
        return;
      }
      api.sendNotification?.({
        type: "info",
        message: t(
          "Starting Bannerlord to join {{server}}. It joins once the game is in the multiplayer lobby.",
          { server: row.lobby?.ServerName ?? formatServerAddress(row) },
        ),
        displayMS: 8000,
      });
    },
    [
      api,
      t,
      gamePath,
      gameStore,
      getRequiredStatuses,
      showJoinBlockers,
      downloadMapsForJoinAsync,
    ],
  );

  const joinServerAsync = useCallback(
    async (row: IServerRow): Promise<void> => {
      if (joining) {
        return;
      }
      setJoining(true);
      try {
        await startGameForServerAsync(row);
      } catch (err) {
        api.showErrorNotification?.(t("Failed to start the game"), err);
      } finally {
        setJoining(false);
      }
    },
    [api, t, joining, setJoining, startGameForServerAsync],
  );

  /**
   * The Load Order page shows the active profile's load order, so a change to that profile's file is read again.
   * Only when it shows the multiplayer one, the singleplayer one wasn't changed
   */
  const reloadActiveLoadOrderAsync = useCallback(
    async (profileId: string): Promise<void> => {
      const state = api.getState<IStateWithBannerlord>();
      if (
        selectors.activeProfile(state)?.id === profileId &&
        bselectors.gameModeForProfile(state, profileId) === "multiplayer"
      ) {
        await reloadLoadOrderAsync(api);
      }
    },
    [api],
  );

  /**
   * Plans the profile from what is installed now, the page's copy can be older
   */
  const planProfileNowAsync = useCallback(
    async (
      row: IServerRow,
      requirements: IClientModuleRequirement[] = getRequiredClientModules(row),
    ) => {
      const state = api.getState<IStateWithBannerlord>();
      // Without it the mods' modules can't be read, and the plan would come out empty
      const currentStagingPath = selectors.installPathForGame(state, GAME_ID);
      if (currentStagingPath === undefined) {
        throw new Error("The mods folder for Bannerlord is not known yet");
      }
      const currentMods = state.persistent.mods[GAME_ID] ?? {};
      const deployed =
        await VortexLauncherManager.getInstance(api).getAllModulesAsync();
      const plan = planServerProfile(
        requirements,
        await readStagedModulesAsync(currentStagingPath, currentMods),
        getUnmanagedModules(deployed, currentMods),
      );
      return { state, currentMods, plan };
    },
    [api],
  );

  /**
   * Switches to a profile with the mods the server needs enabled, creating it the first time, and joins.
   * "server" is the server's own profile, "no-mods" the one profile shared by servers that run without mods
   */
  const joinWithProfileAsync = useCallback(
    async (row: IServerRow, kind: "server" | "no-mods"): Promise<void> => {
      if (joining || gamePath === undefined || stagingPath === undefined) {
        return;
      }
      setJoining(true);
      try {
        const planned = await planProfileNowAsync(row);
        const { state, currentMods } = planned;
        const plan =
          kind === "no-mods"
            ? limitPlanToServerJoin(planned.plan, currentMods)
            : planned.plan;
        const blockers = [
          ...getSharedJoinBlockers(row, {
            store: gameStore,
            gamePath,
            gameRunning: isGameRunning(state),
          }),
          ...getServerProfileBlockers(plan),
        ];
        if (blockers.length > 0) {
          showJoinBlockers(blockers);
          return;
        }

        const existing =
          kind === "server"
            ? findServerProfile(state.persistent.profiles, row.id)
            : findNoModsProfile(state.persistent.profiles);
        const profileName =
          existing?.name ??
          (kind === "server"
            ? getServerProfileName(row)
            : NO_MODS_PROFILE_NAME);
        const serverName = row.lobby?.ServerName ?? formatServerAddress(row);
        const modNames = plan.modIds
          .map((modId) => currentMods[modId])
          .filter((mod) => mod !== undefined)
          .map((mod) => `- ${util.renderModName(mod)}`);
        const confirmLabel = existing
          ? t("Switch and Join")
          : t("Create and Join");
        const intro =
          kind === "server"
            ? existing
              ? t(
                  "Vortex will switch to the profile '{{profile}}' made for {{server}}, " +
                    "make sure the mods the server needs are enabled there and start the game.",
                  { profile: profileName, server: serverName },
                )
              : t(
                  "Vortex will create the profile '{{profile}}' for {{server}}, " +
                    "enable only the mods the server needs there, switch to it and start the game. " +
                    "Joining this server again reuses the profile.",
                  { profile: profileName, server: serverName },
                )
            : existing
              ? t(
                  "{{server}} requires no mods. Vortex will switch to the default No Mods profile, " +
                    "'{{profile}}', and start the game.",
                  { profile: profileName, server: serverName },
                )
              : t(
                  "{{server}} requires no mods. Vortex will set up the default No Mods profile, '{{profile}}', " +
                    "switch to it and start the game. Every server without mods uses it from now on.",
                  { profile: profileName, server: serverName },
                );
        const unchanged = t(
          "Your current profile, {{profile}}, is not changed.",
          {
            profile: profile?.name ?? "",
          },
        );
        const modList =
          modNames.length > 0
            ? `\n\n${t("Mods to enable:")}\n${modNames.join("\n")}`
            : "";
        const title =
          kind === "server"
            ? existing
              ? t("Switch to the Server Profile")
              : t("Create a Server Profile")
            : existing
              ? t("Switch to the No Mods Profile")
              : t("Set Up the No Mods Profile");
        const result = await api.showDialog?.(
          "question",
          title,
          { text: `${intro}\n\n${unchanged}${modList}` },
          [{ label: t("Cancel") }, { label: confirmLabel, default: true }],
        );
        if (result?.action !== confirmLabel) {
          return;
        }

        const target =
          existing ??
          (kind === "server"
            ? await createServerProfileAsync(api, row)
            : await createNoModsProfileAsync(api, profileName));
        // Made for the server, it is joined as a Multiplayer profile even if its type was changed
        if (
          bselectors.gameModeForProfile(api.getState(), target.id) !==
          "multiplayer"
        ) {
          api.store?.dispatch(
            actions.setFeature(target.id, MULTIPLAYER_PROFILE_FEATURE, true),
          );
        }
        await enableServerModsAsync(api, target.id, plan);
        // Switching reads the load order, a profile already active is read again here
        await reloadActiveLoadOrderAsync(target.id);
        await switchProfileAsync(api, target.id);
        await startGameForServerAsync(row);
      } catch (err) {
        // Vortex reports a failed profile switch itself
        if (!(err instanceof util.UserCanceled)) {
          api.showErrorNotification?.(
            t("Failed to join with the profile"),
            err,
          );
        }
      } finally {
        setJoining(false);
      }
    },
    [
      api,
      t,
      joining,
      setJoining,
      gamePath,
      gameStore,
      stagingPath,
      profile,
      planProfileNowAsync,
      reloadActiveLoadOrderAsync,
      showJoinBlockers,
      startGameForServerAsync,
    ],
  );

  /**
   * Creates the server's own profile with the mods the server needs that Vortex already has enabled. Doesn't switch
   * to it, joining then uses it. What is missing is left to the caller, which creates the profile to install it into
   */
  const createServerProfileWithModsAsync = useCallback(
    async (row: IServerRow): Promise<types.IProfile> => {
      const { plan } = await planProfileNowAsync(row);
      const created = await createServerProfileAsync(api, row);
      await enableServerModsAsync(api, created.id, plan);
      return created;
    },
    [api, planProfileNowAsync],
  );

  /**
   * A server without mods that allows optional ones can still get a profile of its own, to add those mods to.
   * Creates it and switches to it, so the mods added next go there. Joining then uses it
   */
  const createServerProfileOnlyAsync = useCallback(
    async (row: IServerRow): Promise<void> => {
      if (stagingPath === undefined) {
        return;
      }
      let created: types.IProfile;
      try {
        created = await createServerProfileWithModsAsync(row);
      } catch (err) {
        api.showErrorNotification?.(t("Failed to create the profile"), err);
        return;
      }
      try {
        await switchProfileAsync(api, created.id);
      } catch (err) {
        // Vortex reports a failed profile switch itself
        if (!(err instanceof util.UserCanceled)) {
          api.showErrorNotification?.(t("Failed to switch the profile"), err);
        }
        return;
      }
      api.sendNotification?.({
        type: "success",
        message: t(
          "Switched to '{{profile}}', the profile made for this server. Add the optional mods you want, joining the server uses it.",
          { profile: created.name },
        ),
        displayMS: 8000,
      });
    },
    [api, t, stagingPath, createServerProfileWithModsAsync],
  );

  /**
   * Where a mod from the server's panel goes. The server's profile when it has one. A required mod otherwise goes to
   * the current profile, joining with it needs the mod. An optional one, or any mod while the current profile can't
   * take it (getCurrentProfileRefusal), waits for the player to create the server's profile, or for an optional one
   * to pick the current profile instead when it can. created says the profile was just made for this. Null when
   * cancelled
   */
  const chooseModProfileAsync = useCallback(
    async (
      row: IServerRow,
      requirement: IClientModuleRequirement,
    ): Promise<{ profile: types.IProfile; created: boolean } | null> => {
      const state = api.getState<IStateWithBannerlord>();
      const existing = findServerProfile(state.persistent.profiles, row.id);
      if (existing !== undefined) {
        return { profile: existing, created: false };
      }
      const current = selectors.activeProfile(state);
      const refusal = getCurrentProfileRefusal(state, current, row);
      const currentAllowed = current !== undefined && refusal === null;
      if (requirement.required && currentAllowed) {
        return { profile: current, created: false };
      }

      const values = {
        mod: requirement.name,
        server: row.lobby?.ServerName ?? formatServerAddress(row),
        profile: getServerProfileName(row),
        current: current?.name ?? "",
      };
      const required = {
        "no-mods": t(
          "{{server}} requires {{mod}}, and your current profile, {{current}}, is the No Mods profile, " +
            "which stays without mods.",
          values,
        ),
        singleplayer: t(
          "{{server}} requires {{mod}}, and your current profile, {{current}}, is a Singleplayer profile, " +
            "which doesn't join servers.",
          values,
        ),
        "other-server": t(
          "{{server}} requires {{mod}}, and your current profile, {{current}}, is the profile of another server.",
          values,
        ),
        none: t("{{server}} requires {{mod}}.", values),
      };
      const intro = requirement.required
        ? required[refusal ?? "none"]
        : t("{{mod}} is optional on {{server}}.", values);
      const offer = t(
        "A profile of the server's own keeps it, and the mods the server needs, out of your other profiles. " +
          "Vortex will create the profile '{{profile}}' with {{mod}} enabled, and joining the server uses it.",
        values,
      );
      const alternative = currentAllowed
        ? `\n\n${t("Or enable {{mod}} in your current profile, {{current}}.", values)}`
        : "";
      const createLabel = t("Create Server Profile");
      const currentLabel = t("Add to Current Profile");
      const result = await api.showDialog?.(
        "question",
        t("Create a Profile for This Server?"),
        { text: `${intro} ${offer}${alternative}` },
        [
          { label: t("Cancel") },
          ...(currentAllowed ? [{ label: currentLabel }] : []),
          { label: createLabel, default: true },
        ],
      );
      switch (result?.action) {
        case createLabel: {
          const created = await createServerProfileWithModsAsync(row);
          return { profile: created, created: true };
        }
        case currentLabel:
          return current !== undefined
            ? { profile: current, created: false }
            : null;
        default:
          return null;
      }
    },
    [api, t, createServerProfileWithModsAsync],
  );

  /**
   * Vortex installs a collection into the active profile, so it is installed into the server's profile by switching
   * to it first. Without one the player picks between creating it and the current profile
   */
  const installCollectionForServerAsync = useCallback(
    async (revision: ICollectionRevisionInfo): Promise<void> => {
      if (selectedRow === null) {
        return;
      }
      if (revision.gameDomain !== null && revision.gameDomain !== GAME_ID) {
        api.showErrorNotification?.(
          t("The collection is not for Bannerlord"),
          t("'{{name}}' is a collection for {{game}}", {
            name: revision.name,
            game: revision.gameDomain,
          }),
          { allowReport: false },
        );
        return;
      }

      // Vortex only installs one collection at a time, but would only report a conflict after downloading finishes
      if (isCollectionInstalling(api.getState())) {
        api.showErrorNotification?.(
          t("Another collection is being installed"),
          t(
            "Please wait for the current collection installation to finish before installing '{{name}}'.",
            {
              name: revision.name,
            },
          ),
          { allowReport: false },
        );
        return;
      }

      const state = api.getState<IStateWithBannerlord>();
      const current = selectors.activeProfile(state);
      const existing = findServerProfile(
        state.persistent.profiles,
        selectedRow.id,
      );
      // The slug comes from the server, so show what Nexus Mods says it is before installing anything
      const about = t(
        "The server {{server}} offers the collection '{{name}}' by {{author}}, " +
          "revision {{revision}} with {{count}} mods.",
        {
          server:
            selectedRow.lobby?.ServerName ?? formatServerAddress(selectedRow),
          name: revision.name,
          author: revision.author ?? t("an unknown author"),
          revision: `${revision.revisionNumber}`,
          count:
            revision.modCount !== null ? `${revision.modCount}` : t("some"),
        },
      );
      const installLabel = t("Install");
      const switchLabel = t("Switch and Install");
      const createLabel = t("Create Profile and Install");
      const currentLabel = t("Install in Current Profile");
      // Not the No Mods profile, a Singleplayer profile or another server's profile
      const currentAllowed =
        current !== undefined &&
        getCurrentProfileRefusal(state, current, selectedRow) === null;
      const where =
        existing === undefined
          ? t(
              "A profile of the server's own keeps the collection out of your other profiles. " +
                "Vortex will create the profile '{{profile}}', switch to it and install the collection there, " +
                "and joining the server uses it.",
              { profile: getServerProfileName(selectedRow) },
            ) +
            (currentAllowed
              ? ` ${t("Or install it into your current profile, {{current}}.", { current: current.name })}`
              : "")
          : existing.id === current?.id
            ? t(
                "Vortex will install it into the server's profile, {{profile}}.",
                {
                  profile: existing.name,
                },
              )
            : t(
                "Vortex will switch to the profile '{{profile}}' made for this server and install it there.",
                { profile: existing.name },
              );
      const choices =
        existing === undefined
          ? [
              { label: t("Cancel") },
              ...(currentAllowed ? [{ label: currentLabel }] : []),
              { label: createLabel, default: true },
            ]
          : [
              { label: t("Cancel") },
              {
                label: existing.id === current?.id ? installLabel : switchLabel,
                default: true,
              },
            ];
      const result = await api.showDialog?.(
        "question",
        t("Install Collection"),
        { text: `${about}\n\n${where}` },
        choices,
      );

      const chosen = [installLabel, currentLabel, switchLabel, createLabel];
      if (result === undefined || !chosen.includes(result.action)) {
        return;
      }
      try {
        // Ensure the user is logged into Nexus Mods before switching profiles or starting the download
        await api.ext?.ensureLoggedIn?.();
        switch (result.action) {
          case installLabel:
          case currentLabel:
            break;
          case switchLabel:
            await switchProfileAsync(api, existing!.id);
            break;
          case createLabel: {
            const created = await createServerProfileWithModsAsync(selectedRow);
            await switchProfileAsync(api, created.id);
            break;
          }
          default:
            return;
        }
        await installCollectionAsync(api, revision);
      } catch (err) {
        // Vortex reports a failed profile switch itself
        if (!(err instanceof util.UserCanceled)) {
          api.showErrorNotification?.(
            t("Failed to install the collection"),
            err,
          );
        }
      }
    },
    [api, t, selectedRow, createServerProfileWithModsAsync],
  );

  // Tracks in-progress mod installations triggered from the server details panel (keyed by module ID)
  const [installingMods, setInstallingMods] = usePageState<
    Record<string, true>
  >("installingMods", {});
  /**
   * After enabling a mod in a profile: enables the mod and its dependencies in the profile's multiplayer load order.
   * If a dedicated profile was created, switches to it; if the target profile is already active, deploys it;
   * otherwise, notifies the player that the mod was installed to an inactive profile.
   */
  const finishModInProfileAsync = useCallback(
    async (
      row: IServerRow,
      requirement: IClientModuleRequirement,
      target: { profile: types.IProfile; created: boolean },
      doneMessage: string,
    ): Promise<void> => {
      const { plan } = await planProfileNowAsync(row, [
        { ...requirement, required: true },
      ]);
      await enableInProfileLoadOrderAsync(
        api,
        target.profile.id,
        "multiplayer",
        plan.modules,
      );
      if (target.created) {
        // Switching to the created profile deploys it and loads its load order
        await switchProfileAsync(api, target.profile.id);
        await refreshInstalledModulesAsync();
      } else if (
        target.profile.id === selectors.activeProfile(api.getState())?.id
      ) {
        // Deploy to disk so the join verification checks pass for the active profile
        await ensureModsDeployedAsync(api);
        await refreshInstalledModulesAsync();
        await reloadActiveLoadOrderAsync(target.profile.id);
      } else {
        // Inactive profiles will be deployed when switched to during the join process
        api.sendNotification?.({
          type: "success",
          message: doneMessage,
          displayMS: 8000,
        });
      }
    },
    [
      api,
      planProfileNowAsync,
      refreshInstalledModulesAsync,
      reloadActiveLoadOrderAsync,
    ],
  );

  /**
   * The Vortex mod that provides a module in the version the server asks for, the newest when any version does
   */
  const findStagedModId = useCallback(
    (requirement: IClientModuleRequirement): string | null =>
      pickStagedModule(
        stagedModules?.get(requirement.id) ?? [],
        requirement.version,
      )?.modId ?? null,
    [stagedModules],
  );

  /**
   * The server's profile, when it enables the mod and isn't the active profile. Then the mod only needs that switch
   */
  const getServerProfileWithMod = useCallback(
    (requirement: IClientModuleRequirement): types.IProfile | null => {
      if (selectedRow === null) {
        return null;
      }
      const modId = findStagedModId(requirement);
      const own = findServerProfile(profiles, selectedRow.id);
      return own !== undefined &&
        own.id !== profile?.id &&
        modId !== null &&
        own.modState?.[modId]?.enabled === true
        ? own
        : null;
    },
    [selectedRow, profiles, profile, findStagedModId],
  );

  /**
   * A mod installed in Vortex that the current profile doesn't deploy. When the server's profile enables it, that
   * profile is switched to. Otherwise it is enabled where chooseModProfileAsync picks
   */
  const enableClientModAsync = useCallback(
    async (requirement: IClientModuleRequirement): Promise<void> => {
      const modId = findStagedModId(requirement);
      if (
        selectedRow === null ||
        modId === null ||
        requirement.id in installingMods
      ) {
        return;
      }

      const own = getServerProfileWithMod(requirement);
      if (own !== null) {
        const switchLabel = t("Switch Profile");
        const result = await api.showDialog?.(
          "question",
          t("Use the Server Profile?"),
          {
            text: t(
              "{{mod}} is enabled in '{{profile}}', the profile made for {{server}}. " +
                "Vortex will switch to it and deploy its mods.",
              {
                mod: requirement.name,
                profile: own.name,
                server:
                  selectedRow.lobby?.ServerName ??
                  formatServerAddress(selectedRow),
              },
            ),
          },
          [{ label: t("Cancel") }, { label: switchLabel, default: true }],
        );
        if (result?.action !== switchLabel) {
          return;
        }
        try {
          await switchProfileAsync(api, own.id);
        } catch (err) {
          // Vortex reports a failed profile switch itself
          if (!(err instanceof util.UserCanceled)) {
            api.showErrorNotification?.(t("Failed to switch the profile"), err);
          }
        }
        return;
      }

      setInstallingMods((previous) => ({
        ...previous,
        [requirement.id]: true,
      }));
      try {
        const target = await chooseModProfileAsync(selectedRow, requirement);
        if (!target) {
          return;
        }
        await enableModsAsync(api, target.profile.id, [modId]);
        await finishModInProfileAsync(
          selectedRow,
          requirement,
          target,
          t(
            "Enabled {{mod}} in the profile '{{profile}}'. Joining the server uses it.",
            { mod: requirement.name, profile: target.profile.name },
          ),
        );
      } catch (err) {
        if (!(err instanceof util.UserCanceled)) {
          api.showErrorNotification?.(
            t("Failed to enable {{mod}}", { mod: requirement.name }),
            err,
          );
        }
      } finally {
        setInstallingMods((previous) => {
          const { [requirement.id]: _done, ...rest } = previous;
          return rest;
        });
      }
    },
    [
      api,
      t,
      selectedRow,
      installingMods,
      setInstallingMods,
      findStagedModId,
      getServerProfileWithMod,
      chooseModProfileAsync,
      finishModInProfileAsync,
    ],
  );

  /**
   * Installs a mod the server names on Nexus Mods into the profile chooseModProfileAsync picks
   */
  const installClientModAsync = useCallback(
    async (requirement: IClientModuleRequirement): Promise<void> => {
      const { nexusMods } = requirement;
      if (
        nexusMods === null ||
        selectedRow === null ||
        requirement.id in installingMods
      ) {
        return;
      }
      setInstallingMods((previous) => ({
        ...previous,
        [requirement.id]: true,
      }));
      try {
        const target = await chooseModProfileAsync(selectedRow, requirement);
        if (!target) {
          return;
        }
        await api.ext?.ensureLoggedIn?.();
        await downloadAndEnableModFileAsync(
          api,
          nexusMods.modId,
          nexusMods.fileId,
          target.profile.id,
        );
        await finishModInProfileAsync(
          selectedRow,
          requirement,
          target,
          t(
            "Installed {{mod}} and enabled it in the profile '{{profile}}'. Joining the server uses it.",
            { mod: requirement.name, profile: target.profile.name },
          ),
        );
      } catch (err) {
        if (!(err instanceof util.UserCanceled)) {
          api.showErrorNotification?.(
            t("Failed to install {{mod}}", { mod: requirement.name }),
            err,
          );
        }
      } finally {
        setInstallingMods((previous) => {
          const { [requirement.id]: _done, ...rest } = previous;
          return rest;
        });
      }
    },
    [
      api,
      t,
      selectedRow,
      installingMods,
      setInstallingMods,
      chooseModProfileAsync,
      finishModInProfileAsync,
    ],
  );

  const refreshLobbyAsync = useCallback(async (): Promise<void> => {
    if (lobbyLoading) {
      return;
    }
    setLobbyLoading(true);
    try {
      const serverList = await fetchLobbyServersAsync(api);
      setLobbyServerList(serverList);
      setPings({});
    } catch (err) {
      api.showErrorNotification?.(
        t("Failed to get the server list from the lobby"),
        err instanceof LobbyError ? err.message : err,
        { allowReport: !(err instanceof LobbyError) },
      );
    } finally {
      setLobbyLoading(false);
    }
  }, [api, t, lobbyLoading, setLobbyLoading, setLobbyServerList, setPings]);

  const addServerAsync = useCallback(async (): Promise<void> => {
    const addLabel = t("Add");
    const dialogResult = await api.showDialog?.(
      "question",
      t("Add Server"),
      {
        text: t(
          "Enter the address of a Bannerlord dedicated server as host or host:port. " +
            "If the port is left out, {{port}} is used.",
          { port: `${DEFAULT_SERVER_PORT}` },
        ),
        input: [
          {
            id: "address",
            label: t("Address"),
            placeholder: `127.0.0.1:${DEFAULT_SERVER_PORT}`,
            value: "",
          },
        ],
      },
      [{ label: t("Cancel") }, { label: addLabel, default: true }],
    );
    if (dialogResult?.action !== addLabel) {
      return;
    }

    const input = String(dialogResult.input?.address ?? "");
    const parsed = parseServerAddress(input);
    if (!parsed) {
      api.showErrorNotification?.(
        t("Invalid server address"),
        t("'{{address}}' is not a valid host or host:port", {
          address: input,
        }),
        { allowReport: false },
      );
      return;
    }

    const id = getServerId(parsed);
    if (manualServers[id] === undefined) {
      store.dispatch(
        actionsServers.addServer({ id, ...parsed, addedAt: Date.now() }),
      );
    }
    setSelectedId(id);
  }, [api, t, manualServers, store]);

  const checkServer = useCallback(
    (row: IServerRow): void => void probeAsync([row]),
    [probeAsync],
  );

  const removeServer = useCallback(
    (row: IServerRow): void => {
      store.dispatch(actionsServers.removeServer(row.id));
      setSelectedId(null);
    },
    [store, setSelectedId],
  );

  /**
   * The row's Join button does what the details panel's main button does for that server: join with its own profile,
   * the No Mods profile, or the current one when that is already the right profile
   */
  const quickJoinAsync = useCallback(
    async (row: IServerRow): Promise<void> => {
      setSelectedId(row.id);
      const ownProfile = findServerProfile(profiles, row.id);
      const sharedProfile =
        ownProfile === undefined && runsWithoutMods(row)
          ? (findNoModsProfile(profiles) ?? null)
          : null;
      const target = ownProfile ?? sharedProfile;
      if (target !== null && target.id === profile?.id && isMultiplayer) {
        await joinServerAsync(row);
      } else if (ownProfile === undefined && runsWithoutMods(row)) {
        await joinWithProfileAsync(row, "no-mods");
      } else {
        await joinWithProfileAsync(row, "server");
      }
    },
    [
      profiles,
      profile,
      isMultiplayer,
      setSelectedId,
      joinServerAsync,
      joinWithProfileAsync,
    ],
  );

  const columns = useMemo(
    () =>
      getServerColumns(
        t,
        (action) => store.dispatch(action as never),
        lobbyServerList !== null,
      ),
    [t, store, lobbyServerList],
  );
  // Kept in Vortex's table settings, so the columns a user hid stay hidden
  const columnVisibility = useColumnVisibility("bannerlord-servers", columns);
  const rowActions = useMemo(
    () =>
      getServerRowActions(t, {
        getJoin: (row) => {
          const reason = getJoinUnsupportedReason(row);
          if (reason !== null) {
            return { enabled: false, reason: t(reason) };
          }
          if (serverJoinAvailable === false) {
            return {
              enabled: false,
              reason: t("Joining from Vortex needs Server Join"),
            };
          }
          return { enabled: !joining, reason: null };
        },
        onJoin: (row) => void quickJoinAsync(row),
        onCheck: checkServer,
        onRemove: removeServer,
      }),
    [
      t,
      serverJoinAvailable,
      joining,
      quickJoinAsync,
      checkServer,
      removeServer,
    ],
  );
  // Most players first until the user picks another column
  const [sort, setSort] = usePageState<TableSort | null>("sort", {
    columnId: "players",
    direction: "desc",
  });

  // The toolbar's search and the Filters popover narrow the list, like the Modern UI Mods table's toolbar.
  // The filters are kept in the settings, the search only while Vortex runs
  const filters = useSelector(bselectors.serverFilters);
  const [search, setSearch] = usePageState("search", "");
  const visibleRows = useMemo(
    () => filterServerRows(rows, filters, search, installedModules),
    [rows, filters, search, installedModules],
  );
  const modeChoices = useMemo(
    () => getModeChoices(rows, filters, search, installedModules),
    [rows, filters, search, installedModules],
  );
  const setFilters = (next: typeof filters): void => {
    store.dispatch(actionsServers.setServerFilters(next));
  };
  const checkLabels: Record<(typeof SERVER_CHECKS)[number], string> = {
    favorites: t("Favorites"),
    hasPlayers: t("Has players"),
    notFull: t("Not full"),
    noPassword: t("No password"),
    community: t("Community servers"),
    readyWithMyMods: t("Ready with my mods"),
    noModsNeeded: t("No mods needed"),
  };

  const grouping = useMemo(
    (): TableGrouping | null =>
      groupBy !== null
        ? createTableGrouping(
            groupBy,
            t("Unknown"),
            collapsedGroups,
            setCollapsedGroups,
          )
        : null,
    [groupBy, collapsedGroups, setCollapsedGroups, t],
  );
  const groupByLabels: Record<NonNullable<ServerGroupBy> | "none", string> = {
    none: t("None"),
    gameType: t("Mode"),
    map: t("Map"),
  };
  // The views are shortcuts to the server groupings, then the downloaded maps
  const activeView = activeTab === "maps" ? "maps" : (groupBy ?? "servers");

  // Null until the game folder is read, which is not the same as having none
  const downloadedMaps = useMemo(
    () => (localScenes !== null ? getDownloadedMaps(localScenes) : null),
    [localScenes],
  );
  const mapsFolder =
    gamePath !== undefined ? getDownloadedMapsPath(gamePath) : null;

  const refreshAllAsync = async (): Promise<void> => {
    await refreshLobbyAsync();
    await refreshInstalledModulesAsync();
  };

  const lobbyStatus = lobbyLoading
    ? t("Signing in to the lobby...")
    : lobbyServerList !== null
      ? t("{{count}} lobby servers, checked at {{time}}", {
          count: `${lobbyServerList.servers.length}`,
          time: new Date(lobbyServerList.fetchedAt).toLocaleTimeString(),
        })
      : t("Lobby not checked yet");

  const headerActions =
    activeTab === "maps" ? (
      <>
        <ActionButton
          variant="weak"
          icon="refresh"
          onClick={() => void refreshLocalScenesAsync()}
        >
          {t("Rescan")}
        </ActionButton>
        <ActionButton
          variant="weak"
          icon="open-ext"
          {...(mapsFolder !== null ? { title: mapsFolder } : {})}
          disabled={mapsFolder === null}
          onClick={() => {
            if (mapsFolder !== null) {
              util.opn(mapsFolder).catch(() => null);
            }
          }}
        >
          {t("Open Folder")}
        </ActionButton>
      </>
    ) : (
      <>
        <span className="bls-lobby-status bls-small" role="status">
          <span
            className={
              lobbyServerList !== null ? "bls-dot is-online" : "bls-dot"
            }
          />
          {lobbyStatus}
        </span>
        <ActionButton
          variant="weak"
          icon="add"
          onClick={() => void addServerAsync()}
        >
          {t("Add Server")}
        </ActionButton>
        <ActionButton
          variant="weak"
          icon={manualPing.running ? "spinner" : "refresh"}
          disabled={
            lobbyServerList === null ||
            manualPing.running ||
            cooldownLeftMs > 0 ||
            Object.keys(rows).length === 0
          }
          title={
            lobbyServerList === null
              ? t(
                  "Refresh the lobby first, servers are pinged once it lists them",
                )
              : t(
                  "Pings every server in the list again, the way the game does, falling back to a TCP connection " +
                    "and then to an estimate. Once every {{seconds}} seconds.",
                  { seconds: `${PING_COOLDOWN_MS / 1000}` },
                )
          }
          onClick={() => void pingAllAsync()}
        >
          {manualPing.running
            ? t("Pinging...")
            : cooldownLeftMs > 0
              ? t("Ping Again in {{seconds}}s", {
                  seconds: `${Math.ceil(cooldownLeftMs / 1000)}`,
                })
              : t("Ping Servers")}
        </ActionButton>
        <ActionButton
          variant="weak"
          icon={lobbyLoading ? "spinner" : "refresh"}
          disabled={lobbyLoading}
          onClick={() => void refreshAllAsync()}
        >
          {t("Refresh Lobby")}
        </ActionButton>
      </>
    );

  const showFirstRun =
    lobbyServerList === null && Object.keys(rows).length === 0;

  return (
    <MainPage>
      <MainPage.Body>
        <div className="bls-page">
          <ModernPageHeader
            pictogram="servers"
            title={t("Multiplayer Servers")}
            subtitle={t(
              "Custom servers from the official lobby, plus servers you added by address.",
            )}
            actions={headerActions}
          />
          <TableToolbar
            start={
              <ToolbarViews
                label={t("Views")}
                views={[
                  {
                    id: "servers",
                    label: t("All servers"),
                    count: Object.keys(rows).length,
                  },
                  { id: "gameType", label: t("Modes") },
                  { id: "map", label: t("Maps") },
                  {
                    id: "maps",
                    label: t("Downloaded maps"),
                    count: downloadedMaps?.length ?? "…",
                  },
                ]}
                selected={activeView}
                onSelect={(id) => {
                  if (id === "maps") {
                    setActiveTab("maps");
                    return;
                  }
                  setActiveTab("servers");
                  setGroupBy(id === "gameType" || id === "map" ? id : null);
                }}
              />
            }
          >
            {activeTab === "servers" && !showFirstRun && (
              <>
                <ToolbarSearch
                  label={t("Search servers")}
                  value={search}
                  onChange={setSearch}
                />
                <FilterPopover
                  label={t("Filters")}
                  activeCount={countActiveFilters(filters)}
                  resetLabel={t("Reset filters")}
                  onReset={() =>
                    setFilters({
                      ...filters,
                      ...Object.fromEntries(
                        SERVER_CHECKS.map((check) => [check, false]),
                      ),
                      modes: [],
                    })
                  }
                >
                  <FilterGroup title={t("Show only")}>
                    {SERVER_CHECKS.map((check) => (
                      <FilterCheckbox
                        key={check}
                        label={checkLabels[check]}
                        checked={filters[check]}
                        onChange={(checked) =>
                          setFilters({ ...filters, [check]: checked })
                        }
                      />
                    ))}
                  </FilterGroup>
                  {modeChoices.length > 0 && (
                    <FilterGroup title={t("Game mode")}>
                      <div className="bls-popover-scroll">
                        {modeChoices.map(({ mode, count }) => (
                          <FilterCheckbox
                            key={mode}
                            label={mode}
                            count={count}
                            checked={filters.modes.includes(mode)}
                            onChange={(checked) =>
                              setFilters({
                                ...filters,
                                modes: checked
                                  ? [...filters.modes, mode]
                                  : filters.modes.filter((m) => m !== mode),
                              })
                            }
                          />
                        ))}
                      </div>
                    </FilterGroup>
                  )}
                </FilterPopover>
                <DisplayOptionsPopover
                  label={t("Display options")}
                  canReset={groupBy !== null || columnVisibility.canReset}
                  resetLabel={t("Reset to default")}
                  onReset={() => {
                    setGroupBy(null);
                    columnVisibility.reset();
                  }}
                >
                  <PopoverGroup>
                    <PopoverPicker
                      label={t("Group by")}
                      options={SERVER_GROUP_BY.map((option) => ({
                        value: option,
                        label: groupByLabels[option ?? "none"],
                      }))}
                      value={groupBy}
                      onChange={setGroupBy}
                    />
                  </PopoverGroup>
                  <ColumnToggles
                    title={t("Toggle columns")}
                    toggles={columnVisibility.toggles}
                    onToggle={columnVisibility.setVisible}
                  />
                </DisplayOptionsPopover>
              </>
            )}
          </TableToolbar>
          <div className="bls-tab-panel">
            {activeTab === "maps" ? (
              <MapsTab
                scenes={downloadedMaps}
                folder={mapsFolder}
                onRemove={removeMapAsync}
              />
            ) : showFirstRun ? (
              <FirstRun
                lobbyLoading={lobbyLoading}
                onRefreshLobby={() => void refreshAllAsync()}
                onAddServer={() => void addServerAsync()}
              />
            ) : (
              <Content
                rows={visibleRows}
                noMatches={
                  <NoMatches
                    title={t("No servers match your search and filters")}
                    resetLabel={t("Clear Search and Filters")}
                    onReset={() => {
                      setSearch("");
                      setFilters({
                        ...filters,
                        ...Object.fromEntries(
                          SERVER_CHECKS.map((check) => [check, false]),
                        ),
                        modes: [],
                      });
                    }}
                  />
                }
                columns={columns}
                hiddenColumns={columnVisibility.hiddenColumns}
                rowActions={rowActions}
                sort={sort}
                onSortChange={setSort}
                grouping={grouping}
                selectedRow={selectedRow}
                rowSelected={setSelectedId}
                installedModules={installedModules}
                collection={{
                  lookup: selectedCollectionLookup,
                  installed: installedCollection,
                  onInstall: installCollectionForServerAsync,
                }}
                mods={{
                  installing: installingMods,
                  onInstall: installClientModAsync,
                  staged: stagedModules,
                  onEnable: enableClientModAsync,
                  getServerProfileName: (requirement) =>
                    getServerProfileWithMod(requirement)?.name ?? null,
                }}
                maps={{
                  statuses: mapStatuses,
                  scanned: localScenes !== null,
                  downloads: mapDownloads,
                  onDownload: downloadMapsAsync,
                }}
                actions={{ onCheck: checkServer, onRemove: removeServer }}
                join={{
                  serverJoin: {
                    available: serverJoinAvailable,
                    disabled: serverJoinDisabled,
                    installing: installingServerJoin,
                    url: SERVER_JOIN_URL,
                    onInstall: installServerJoinAsync,
                  },
                  blockers: sharedJoinBlockers,
                  joining,
                  downloadingMaps: joiningMaps,
                  current: {
                    blockers: currentProfileBlockers,
                    onJoin: joinServerAsync,
                  },
                  serverProfile: {
                    name: serverProfile?.name ?? null,
                    active:
                      serverProfile !== undefined &&
                      serverProfile.id === profile?.id,
                    blockers: serverProfileBlockers,
                    onJoin: (row) => joinWithProfileAsync(row, "server"),
                  },
                  // The server's own profile wins once it has one
                  noModsProfile:
                    selectedRow !== null &&
                    serverProfile === undefined &&
                    runsWithoutMods(selectedRow)
                      ? {
                          name: noModsProfile?.name ?? null,
                          active:
                            noModsProfile !== undefined &&
                            noModsProfile.id === profile?.id,
                          blockers: noModsProfileBlockers,
                          onJoin: (row) => joinWithProfileAsync(row, "no-mods"),
                          onCreateServerProfile:
                            selectedRow.lobby?.AllowsOptionalModules === true
                              ? createServerProfileOnlyAsync
                              : null,
                        }
                      : null,
                }}
              />
            )}
          </div>
        </div>
      </MainPage.Body>
    </MainPage>
  );
};

import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MainContext, MainPage, selectors } from "@nexusmods/vortex-api";
import { useSelector, useStore } from "react-redux";
import { Content } from "./components/Content";
import { SaveLoadOrderActions } from "./components/Sidebar";
import {
  applySaveLoadOrderAsync,
  createProfileForSaveAsync,
  loadOrderMatchesSave,
} from "../fromSave";
import { ISaveGame } from "./types";
import {
  countActiveSaveFilters,
  DEFAULT_SAVE_FILTERS,
  filterSaves,
  getCharacterChoices,
  getSavesAsync,
  ISaveFilters,
} from "./utils";
import { getSaveColumns } from "./tableAttributes";
import { ActionButton } from "@bannerlord/ui/components/Controls";
import {
  DisplayOptionsPopover,
  FilterCheckbox,
  FilterGroup,
  FilterPopover,
  PopoverGroup,
  PopoverPicker,
  TableToolbar,
  ToolbarSearch,
  ToolbarViews,
} from "@bannerlord/ui/components/TableToolbar";
import { ModernPageHeader } from "@bannerlord/ui/components/ModernPageHeader";
import {
  BannerImage,
  BannerSource,
  useBannerColors,
} from "@bannerlord/ui/components/BannerImage";
import {
  ColumnToggles,
  useColumnVisibility,
} from "@bannerlord/ui/components/ColumnToggles";
import { NoMatches } from "@bannerlord/ui/components/NoMatches";
import {
  createTableGrouping,
  TableSort,
} from "@bannerlord/ui/components/ModernTable";
import { useLocalization } from "@bannerlord/core/localization/hooks";
import { actionsSave } from "../actions";
import { VortexLauncherManager } from "@bannerlord/core/launcher/manager";
import { bselectors } from "@bannerlord/core/selectors";
import { savesSelectors } from "../selectors";
import { IStateWithSaves } from "../types";
import { useHasBLSE } from "@bannerlord/core/blse/hooks";

// getSavesAsync lists "start without a save" as a save with this index, the page offers it as a button instead
const NO_SAVE_INDEX = 0;

// The save table columns the saves can be grouped by, null for no grouping
type SaveGroupBy = "characterName" | "applicationVersion" | null;
const SAVE_GROUP_BY: SaveGroupBy[] = [
  null,
  "characterName",
  "applicationVersion",
];

export const SavePage: FC = () => {
  const context = useContext(MainContext);
  const api = context.api;

  const { localize: t } = useLocalization();

  const profile = useSelector(selectors.activeProfile);
  const saveName = useSelector((state: IStateWithSaves) =>
    profile !== undefined
      ? (savesSelectors.saveNameForProfile(state, profile.id) ?? null)
      : null,
  );
  const hasBLSE = useHasBLSE();
  // Read by the reload, so choosing a save doesn't read every save file again
  const saveNameRef = useRef(saveName);
  saveNameRef.current = saveName;

  const store = useStore();

  const [saves, setSaves] = useState<Record<string, ISaveGame>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedSave, setSelectedSave] = useState<ISaveGame | null>(null);
  const [search, setSearch] = useState("");
  // Newest first until the user picks another column
  const [sort, setSort] = useState<TableSort | null>({
    columnId: "creationTime",
    direction: "desc",
  });
  const [filters, setFilters] = useState<ISaveFilters>(DEFAULT_SAVE_FILTERS);
  // The column the saves are grouped by, set from Display options or the Characters view
  const [groupBy, setGroupBy] = useState<SaveGroupBy>(null);
  // The collapsed groups of each column
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, string[]>
  >({});
  // Each character's latest save, whose clan banner and color its group shows
  const latestByCharacter = useMemo(() => {
    const latest: Record<string, ISaveGame> = {};
    for (const save of Object.values(saves)) {
      const character = save.characterName;
      if (character === undefined || character === "") {
        continue;
      }
      const current = latest[character];
      if (
        current === undefined ||
        (save.creationTime ?? -Infinity) > (current.creationTime ?? -Infinity)
      ) {
        latest[character] = save;
      }
    }
    return latest;
  }, [saves]);
  const characterBanners = useMemo(
    (): Record<string, BannerSource> =>
      groupBy === "characterName"
        ? Object.fromEntries(
            Object.entries(latestByCharacter).flatMap(([character, save]) =>
              save.clanBannerCode !== undefined && save.clanBannerCode !== ""
                ? [
                    [
                      character,
                      {
                        code: save.clanBannerCode,
                        modules: Object.keys(save.modules),
                      },
                    ],
                  ]
                : [],
            ),
          )
        : {},
    [groupBy, latestByCharacter],
  );
  const characterColors = useBannerColors(characterBanners);
  const grouping = useMemo(
    () =>
      groupBy !== null
        ? {
            ...createTableGrouping(
              groupBy,
              t("Unknown"),
              collapsedGroups,
              setCollapsedGroups,
            ),
            ...(groupBy === "characterName"
              ? {
                  decorate: (character: string) => {
                    const banner = characterBanners[character];
                    return banner !== undefined
                      ? {
                          image: (
                            <span className="bls-save-banner">
                              <BannerImage
                                code={banner.code}
                                modules={banner.modules}
                              />
                            </span>
                          ),
                          color: characterColors[character] ?? null,
                        }
                      : undefined;
                  },
                }
              : {}),
          }
        : null,
    [groupBy, collapsedGroups, characterBanners, characterColors, t],
  );
  const groupByLabels: Record<NonNullable<SaveGroupBy> | "none", string> = {
    none: t("None"),
    characterName: t("{=OJsGrGVi}Character"),
    applicationVersion: t("{=14WBFIS1}Version"),
  };
  const visibleSaves = useMemo(
    () => filterSaves(saves, filters, search),
    [saves, filters, search],
  );
  const characterChoices = useMemo(
    () => getCharacterChoices(saves, filters, search),
    [saves, filters, search],
  );
  const saveCount = Object.keys(saves).length;

  const launchSave = useMemo(
    () =>
      saveName !== null
        ? (Object.values(saves).find((save) => save.name === saveName) ?? null)
        : null,
    [saves, saveName],
  );

  const setLaunchSaveAsync = useCallback(
    async (save: ISaveGame | null): Promise<void> => {
      if (profile) {
        store.dispatch(
          actionsSave.setCurrentSave(profile.id, save?.name ?? null),
        );
      }
      const launcherManager = VortexLauncherManager.getInstance(api);
      await launcherManager.setSaveFileAsync(save?.name ?? "");
    },
    [profile, store, api],
  );

  const reloadSavesAsync = useCallback(async (): Promise<void> => {
    const saveName = saveNameRef.current;
    setLoading(true);
    try {
      const saveList = await getSavesAsync(api);
      const next = Object.fromEntries(
        Object.entries(saveList).filter(
          ([, save]) => save.index !== NO_SAVE_INDEX,
        ),
      );
      setSaves(next);
      setSelectedSave(
        (previous) =>
          (previous !== null ? next[previous.name] : undefined) ??
          (saveName !== null ? next[saveName] : undefined) ??
          null,
      );
      // A save that was deleted or renamed in the game can't be launched into anymore
      if (
        saveName !== null &&
        !Object.values(next).some((save) => save.name === saveName)
      ) {
        await setLaunchSaveAsync(null);
      }
    } catch (err) {
      api.showErrorNotification?.(t("Failed to reload saves"), err);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [api, t, setLaunchSaveAsync]);

  // Also read again when the profile changes, through setLaunchSaveAsync
  useEffect(() => {
    void reloadSavesAsync();
  }, [reloadSavesAsync]);

  // Setting up the mods a save was made with, both reread the saves' issues afterwards
  const loadOrder = useSelector(bselectors.bannerlordActiveLoadOrder);
  const [settingUpSave, setSettingUpSave] = useState(false);
  const saveLoadOrder = useMemo<SaveLoadOrderActions>(() => {
    const run =
      (action: typeof applySaveLoadOrderAsync) =>
      async (save: ISaveGame): Promise<void> => {
        setSettingUpSave(true);
        try {
          if (await action(api, save)) {
            await reloadSavesAsync();
          }
        } finally {
          setSettingUpSave(false);
        }
      };
    return {
      matches: (save) => loadOrderMatchesSave(loadOrder, save),
      busy: settingUpSave,
      onUse: run(applySaveLoadOrderAsync),
      onCreateProfile: run(createProfileForSaveAsync),
    };
  }, [api, loadOrder, settingUpSave, reloadSavesAsync]);

  const columns = useMemo(
    () => getSaveColumns(t, hasBLSE, launchSave, setLaunchSaveAsync),
    [api, hasBLSE, launchSave, setLaunchSaveAsync],
  );
  // Kept in Vortex's table settings, so the columns a user hid stay hidden
  const columnVisibility = useColumnVisibility("bannerlord-saves", columns);

  return (
    <MainPage>
      <MainPage.Body>
        <div className="bls-page">
          <ModernPageHeader
            pictogram="saves"
            title={t("Saves")}
            subtitle={t(
              "Your campaign saves, checked against the mods you have installed.",
            )}
            actions={
              <ActionButton
                variant="weak"
                icon={loading ? "spinner" : "refresh"}
                disabled={loading}
                onClick={() => void reloadSavesAsync()}
              >
                {t("Refresh")}
              </ActionButton>
            }
          />
          <Content
            saves={visibleSaves}
            hasSaves={saveCount > 0}
            noMatches={
              <NoMatches
                title={t("No saves match your search and filters")}
                resetLabel={t("Clear Search and Filters")}
                onReset={() => {
                  setSearch("");
                  setFilters(DEFAULT_SAVE_FILTERS);
                }}
              />
            }
            toolbar={
              <TableToolbar
                start={
                  // A shortcut to grouping by character, the saves of each campaign together
                  <ToolbarViews
                    label={t("Views")}
                    views={[
                      { id: "all", label: t("All saves"), count: saveCount },
                      { id: "characterName", label: t("Characters") },
                    ]}
                    selected={groupBy ?? "all"}
                    onSelect={(id) =>
                      setGroupBy(id === "characterName" ? id : null)
                    }
                  />
                }
              >
                <ToolbarSearch
                  label={t("Search saves")}
                  value={search}
                  onChange={setSearch}
                />
                <FilterPopover
                  label={t("Filters")}
                  activeCount={countActiveSaveFilters(filters)}
                  resetLabel={t("Reset filters")}
                  onReset={() => setFilters(DEFAULT_SAVE_FILTERS)}
                >
                  <FilterGroup title={t("Show only")}>
                    <FilterCheckbox
                      label={t("Saves without issues")}
                      checked={filters.withoutIssues}
                      onChange={(checked) =>
                        setFilters({ ...filters, withoutIssues: checked })
                      }
                    />
                  </FilterGroup>
                  {characterChoices.length > 0 && (
                    <FilterGroup title={t("Character")}>
                      <div className="bls-popover-scroll">
                        {characterChoices.map(({ character, count }) => (
                          <FilterCheckbox
                            key={character}
                            label={character}
                            count={count}
                            checked={filters.characters.includes(character)}
                            onChange={(checked) =>
                              setFilters({
                                ...filters,
                                characters: checked
                                  ? [...filters.characters, character]
                                  : filters.characters.filter(
                                      (c) => c !== character,
                                    ),
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
                      options={SAVE_GROUP_BY.map((option) => ({
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
              </TableToolbar>
            }
            loaded={loaded}
            columns={columns}
            hiddenColumns={columnVisibility.hiddenColumns}
            sort={sort}
            onSortChange={setSort}
            grouping={grouping}
            selectedSave={selectedSave}
            onSelect={setSelectedSave}
            launchSave={launchSave}
            hasBLSE={hasBLSE}
            onLaunchSave={setLaunchSaveAsync}
            saveLoadOrder={saveLoadOrder}
          />
        </div>
      </MainPage.Body>
    </MainPage>
  );
};

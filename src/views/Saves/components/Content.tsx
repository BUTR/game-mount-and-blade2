import React, { FC, ReactNode, useMemo } from "react";
import { Icon } from "@nexusmods/vortex-api";
import { LaunchBar } from "./LaunchBar";
import { SaveLoadOrderActions, Sidebar } from "./Sidebar";
import { ISaveGame } from "../types";
import { useLocalization } from "../../../localization/hooks";
import {
  ModernTable,
  ModernTableColumn,
  TableGrouping,
  TableSort,
} from "../../Shared/components/ModernTable";

const getSaveId = (save: ISaveGame): string => save.name;

export type ContentProps = {
  /**
   * The saves the search and filters leave
   */
  saves: Record<string, ISaveGame>;
  /**
   * Whether there are saves at all, before searching and filtering
   */
  hasSaves: boolean;
  /**
   * The search and filters row above the list
   */
  toolbar: ReactNode;
  /**
   * Shown instead of the table when the search and filters leave no saves
   */
  noMatches: ReactNode;
  loaded: boolean;
  /**
   * Ids of the columns Display options hides
   */
  hiddenColumns: readonly string[];
  columns: ModernTableColumn<ISaveGame>[];
  sort: TableSort | null;
  onSortChange: (sort: TableSort) => void;
  grouping: TableGrouping | null;
  /**
   * The save shown in the details panel
   */
  selectedSave: ISaveGame | null;
  onSelect: (save: ISaveGame | null) => void;
  /**
   * The save the game is started into, null for none
   */
  launchSave: ISaveGame | null;
  hasBLSE: boolean;
  onLaunchSave: (save: ISaveGame | null) => Promise<void>;
  saveLoadOrder: SaveLoadOrderActions;
};

export const Content: FC<ContentProps> = (props) => {
  const {
    saves,
    hasSaves,
    toolbar,
    noMatches,
    loaded,
    columns,
    hiddenColumns,
    sort,
    onSortChange,
    grouping,
    selectedSave,
    onSelect,
    launchSave,
    hasBLSE,
    onLaunchSave,
    saveLoadOrder,
  } = props;

  const { localize: t } = useLocalization();
  const saveList = useMemo(() => Object.values(saves), [saves]);

  if (loaded && !hasSaves) {
    return (
      <div className="bls-empty bls-small">
        <span className="bls-empty-icon">
          <Icon name="savegame" />
        </span>
        <h2>{t("No saves yet")}</h2>
        <p>
          {t(
            "Saves from your campaigns show up here once you have saved in the game.",
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <LaunchBar
        launchSave={launchSave}
        hasBLSE={hasBLSE}
        onLaunchSave={onLaunchSave}
      />
      {toolbar}
      <div className="bls-split">
        <div className="bls-split-main">
          {Object.keys(saves).length === 0 ? (
            noMatches
          ) : (
            <ModernTable
              label={t("Saves")}
              rows={saveList}
              getId={getSaveId}
              columns={columns}
              hiddenColumns={hiddenColumns}
              sort={sort}
              onSortChange={onSortChange}
              grouping={grouping}
              selectedId={selectedSave?.name ?? null}
              onSelect={(id) =>
                onSelect(id !== null ? (saves[id] ?? null) : null)
              }
            />
          )}
        </div>
        <Sidebar
          save={selectedSave}
          launchSave={launchSave}
          hasBLSE={hasBLSE}
          onLaunchSave={onLaunchSave}
          saveLoadOrder={saveLoadOrder}
        />
      </div>
    </>
  );
};

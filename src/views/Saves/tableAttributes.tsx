import React from "react";
import ticksToDate from "ticks-to-date";
import { RadioView } from "./components/RadioView";
import { StatusView } from "./components/StatusView";
import { ISaveGame } from "./types";
import { countIssues, formatSaveTime } from "./utils";
import { versionToString } from "../../butr/version";
import { BannerImage } from "../Shared/components/BannerImage";
import { ModernTableColumn } from "../Shared/components/ModernTable";

type Localize = (key: string, values?: Record<string, string>) => string;

const Text = ({ value }: { value: string }): JSX.Element => (
  <span className="bls-table-truncate" title={value}>
    {value}
  </span>
);

/**
 * The list's columns. Narrowing the list is the toolbar's search and Filters popover's job
 *
 * @param hasBLSE without BLSE the game can't be started into a save, so there is no Launch column
 * @param launchSave the save the game is started into, null for none
 */
export const getSaveColumns = (
  t: Localize,
  hasBLSE: boolean,
  launchSave: ISaveGame | null,
  onLaunchSave: (save: ISaveGame) => Promise<void>,
): ModernTableColumn<ISaveGame>[] => {
  const launch: ModernTableColumn<ISaveGame> = {
    id: "launch",
    label: t("Launch"),
    width: "52px",
    render: (save) => (
      <RadioView
        save={save}
        checked={save.name === launchSave?.name}
        label={t("Load {{save}} on launch", { save: save.name })}
        onChange={onLaunchSave}
      />
    ),
    sortValue: (save) => (save.name === launchSave?.name ? 1 : 0),
    firstDirection: "desc",
  };

  const columns: ModernTableColumn<ISaveGame>[] = [
    {
      id: "banner",
      label: t("Clan banner"),
      hideLabel: true,
      width: "28px",
      // Fixed-size slot to maintain consistent row alignment while banners load or if a save has none
      render: (save) => (
        <span className="bls-save-banner">
          <BannerImage
            code={save.clanBannerCode}
            modules={Object.keys(save.modules)}
          />
        </span>
      ),
    },
    {
      id: "name",
      label: t("{=JtelOsIW}Name"),
      width: "minmax(200px, 1fr)",
      render: (save) => (
        <span className="bls-table-truncate bls-save-name" title={save.name}>
          {save.name}
        </span>
      ),
      sortValue: (save) => save.name,
    },
    {
      id: "characterName",
      toggleable: true,
      label: t("{=OJsGrGVi}Character"),
      width: "160px",
      render: (save) => <Text value={save.characterName ?? ""} />,
      sortValue: (save) => save.characterName ?? null,
      groupValue: (save) => save.characterName ?? null,
    },
    {
      id: "mainHeroLevel",
      toggleable: true,
      label: t("{=JxpEEQdF}Level"),
      width: "56px",
      align: "end",
      render: (save) => save.mainHeroLevel ?? "",
      sortValue: (save) => save.mainHeroLevel ?? null,
      firstDirection: "desc",
    },
    {
      id: "dayLong",
      toggleable: true,
      label: t("{=qkkTPycE}Days"),
      width: "56px",
      align: "end",
      render: (save) =>
        save.dayLong !== undefined ? Math.floor(save.dayLong) : "",
      sortValue: (save) =>
        save.dayLong !== undefined ? Math.floor(save.dayLong) : null,
      firstDirection: "desc",
    },
    {
      id: "status",
      toggleable: true,
      label: t("Issues"),
      width: "100px",
      render: (save) => <StatusView save={save} localize={t} />,
      sortValue: (save) => countIssues(save),
      firstDirection: "desc",
    },
    {
      id: "applicationVersion",
      toggleable: true,
      label: t("{=14WBFIS1}Version"),
      width: "100px",
      render: (save) => (
        <Text
          value={
            save.applicationVersion
              ? versionToString(save.applicationVersion)
              : ""
          }
        />
      ),
      sortValue: (save) =>
        save.applicationVersion
          ? versionToString(save.applicationVersion)
          : null,
      groupValue: (save) =>
        save.applicationVersion
          ? versionToString(save.applicationVersion)
          : null,
      // The newest game version first
      groupDirection: "desc",
    },
    {
      id: "creationTime",
      toggleable: true,
      label: t("{=aYWWDkKX}CreatedAt"),
      width: "160px",
      render: (save) => <Text value={formatSaveTime(save)} />,
      // Sorted by the time, shown as a date
      sortValue: (save) =>
        save.creationTime !== undefined
          ? (ticksToDate(save.creationTime)?.getTime() ?? null)
          : null,
      firstDirection: "desc",
    },
  ];

  return hasBLSE ? [launch, ...columns] : columns;
};

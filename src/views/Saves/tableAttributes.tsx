import React from "react";
import ticksToDate from "ticks-to-date";
import { types } from "vortex-api";
import { RadioView, StatusView } from "./components";
import { ISaveGame } from "./types";
import { LocalizationManager } from "../../localization";
import { versionToString } from "../../launcher";

export const getTableAttributes = (
  api: types.IExtensionApi,
  hasBLSE: boolean,
  selectedSave: ISaveGame | null,
  saveSelectedAsync: (save: ISaveGame) => Promise<void>,
): types.ITableAttribute<[string, ISaveGame]>[] => {
  const { localize: t } = LocalizationManager.getInstance(api);

  const tableAttributes: types.ITableAttribute<[string, ISaveGame]>[] = [
    {
      id: "#",
      name: "#",
      customRenderer: (data) => {
        if (
          data.length &&
          typeof data[0] === "string" &&
          !Array.isArray(data[1])
        ) {
          const save = data[1];
          return (
            <RadioView
              hasBLSE={hasBLSE}
              save={save}
              selectedSave={selectedSave}
              onChange={saveSelectedAsync}
            />
          );
        }
        return <></>;
      },
      placement: "both",
      edit: {},
    },
    {
      id: "name",
      name: t("{=JtelOsIW}Name"),
      calc: ([, save]) => save.name,
      placement: "both",
      edit: {},
    },
    {
      id: "characterName",
      name: t("{=OJsGrGVi}Character"),
      calc: ([, save]) => save.characterName ?? "",
      placement: "both",
      edit: {},
    },
    {
      id: "mainHeroLevel",
      name: t("{=JxpEEQdF}Level"),
      calc: ([, save]) => save.mainHeroLevel ?? "",
      placement: "both",
      edit: {},
    },
    {
      id: "dayLong",
      name: t("{=qkkTPycE}Days"),
      calc: ([, save]) => save.dayLong?.toFixed(0) ?? "",
      placement: "both",
      edit: {},
    },
    {
      id: "status",
      name: t("Status"),
      customRenderer: (data) => {
        if (
          data.length &&
          typeof data[0] === "string" &&
          !Array.isArray(data[1])
        ) {
          const save = data[1];
          return <StatusView save={save} localize={t} />;
        }
        return <></>;
      },
      placement: "both",
      edit: {},
    },
    {
      id: "applicationVersion",
      name: t("{=14WBFIS1}Version"),
      calc: ([, save]) =>
        save.applicationVersion ? versionToString(save.applicationVersion) : "",
      placement: "both",
      edit: {},
    },
    {
      id: "creationTime",
      name: t("{=aYWWDkKX}CreatedAt"),
      calc: ([, save]) => ticksToDate(save.creationTime)?.toLocaleString(),
      placement: "both",
      edit: {},
    },
  ];
  return tableAttributes;
};

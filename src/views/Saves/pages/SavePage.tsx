import React, { useCallback, useEffect, useState } from "react";
import ticksToDate from "ticks-to-date";
import {
  IconBar,
  ITableRowAction,
  MainPage,
  selectors,
  ToolbarIcon,
  types,
} from "vortex-api";
import { useSelector, useStore } from "react-redux";
import { Content, RadioView, StatusView } from "../components";
import { ISaveGame } from "../types";
import { getSavesAsync } from "../utils";
import { LocalizationManager, useLocalization } from "../../../localization";
import { actionsSave } from "../../../save";
import { versionToString, VortexLauncherManager } from "../../../launcher";
import { getSaveFromSettings } from "../../../settings";
import { findBLSEMod } from "../../../blse";
import { getPersistentBannerlordMods, isModActive } from "../../../vortex";

interface IFromState {
  profile: types.IProfile | undefined;
  saveName: string;
  hasBLSE: boolean;
}

export type SavePageProps = {
  context: types.IExtensionContext;
};

export const SavePage = (props: SavePageProps): JSX.Element => {
  const { context } = props;

  const localizationManager = useLocalization();
  const { localize: t } = localizationManager;

  const { profile, saveName, hasBLSE } = useSelector(mapState);

  const store = useStore();

  const mainButtonList = [
    {
      component: ToolbarIcon,
      props: () => ({
        id: `btn-refresh-list`,
        key: `btn-refresh-list`,
        icon: `refresh`,
        text: t(`Refresh`),
        className: `load-order-refresh-list`,
        onClick: async (): Promise<void> => {
          await reloadSavesAsync();
        },
      }),
    },
  ];
  const saveActions: ITableRowAction[] = [];

  const [selectedRowSave, setSelectedRowSave] = useState<ISaveGame | null>(
    null,
  );
  const [selectedSave, setSelectedSave] = useState<ISaveGame | null>(null);

  const [sortedSaveGameList, setSortedSaveGameList] = useState<
    [string, ISaveGame][]
  >([]);

  const saveRowSelected = (save: ISaveGame): void => {
    setSelectedRowSave(save);
  };

  const setSaveAsync = useCallback(
    async (api: types.IExtensionApi, saveId: string | null): Promise<void> => {
      if (profile) {
        store.dispatch(actionsSave.setCurrentSave(profile.id, saveId));
      }

      const launcherManager = VortexLauncherManager.getInstance(api);
      await launcherManager.setSaveFileAsync(saveId ?? "");
    },
    [profile, store],
  );

  const saveSelectedAsync = useCallback(
    async (save: ISaveGame): Promise<void> => {
      await setSaveAsync(context.api, save.index !== 0 ? save.name : null);
      setSelectedSave(save);
    },
    [context.api, setSaveAsync],
  );

  const reloadSavesAsync = useCallback(async (): Promise<void> => {
    try {
      const saveList = await getSavesAsync(context.api);
      setSortedSaveGameList(
        Object.entries(saveList).sort(
          ([, saveA], [, saveB]) => saveA.index - saveB.index,
        ),
      );

      const foundSave = Object.values(saveList).find(
        (value) => value.name === saveName,
      );
      setSelectedSave(foundSave ?? null);
      setSelectedRowSave(foundSave ?? null);
      if (!foundSave) {
        await setSaveAsync(context.api, null);
      }
    } catch (err) {
      context.api.showErrorNotification?.(t("Failed to reload saves"), err);
    }
  }, [context.api, t, saveName, setSaveAsync]);

  useEffect(() => {
    void reloadSavesAsync();
  }, [reloadSavesAsync]);

  return (
    <MainPage>
      <MainPage.Header>
        <IconBar
          group="bannerlord-saves-icons"
          staticElements={mainButtonList}
          className="menubar"
          t={context.api.translate}
        />
      </MainPage.Header>
      <MainPage.Body>
        {Content({
          selectedSave: selectedSave,
          saveActions: saveActions,
          sortedSaveGameList: sortedSaveGameList,
          tableAttributes: getTableAttributes(
            context.api,
            hasBLSE,
            selectedSave,
            saveSelectedAsync,
          ),
          selectedRowSave: selectedRowSave,
          saveRowSelected: saveRowSelected,
        })}
      </MainPage.Body>
    </MainPage>
  );
};

const getTableAttributes = (
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
      customRenderer: (data): JSX.Element => {
        if (
          data.length &&
          typeof data[0] === "string" &&
          !Array.isArray(data[1])
        ) {
          const save = data[1];
          return (
            <RadioView
              api={api}
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
      customRenderer: (data): JSX.Element => {
        if (
          data.length &&
          typeof data[0] === "string" &&
          !Array.isArray(data[1])
        ) {
          const save = data[1];
          return <StatusView api={api} save={save} />;
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

const mapState = (state: types.IState): IFromState => {
  const profile = selectors.activeProfile(state);

  const saveName =
    profile !== undefined
      ? (getSaveFromSettings(state, profile.id) ?? "No Save")
      : "No Save";

  const mods = getPersistentBannerlordMods(state.persistent);
  const blseMod = findBLSEMod(mods);
  const hasBLSE =
    blseMod !== undefined &&
    profile !== undefined &&
    isModActive(profile, blseMod);

  return {
    profile: profile,
    saveName: saveName,
    hasBLSE: hasBLSE,
  };
};

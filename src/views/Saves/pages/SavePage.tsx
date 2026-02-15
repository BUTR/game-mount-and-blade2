import React, { FC, useCallback, useContext, useEffect, useState } from "react";
import {
  IconBar,
  ITableRowAction,
  MainContext,
  MainPage,
  selectors,
  ToolbarIcon,
} from "vortex-api";
import { useSelector, useStore } from "react-redux";
import { Content } from "../components";
import { ISaveGame } from "../types";
import { getSavesAsync } from "../utils";
import { useLocalization } from "../../../localization";
import { actionsSave } from "../../../save";
import { VortexLauncherManager } from "../../../launcher";
import { bselectors } from "../../../selectors";
import { IStateWithBannerlord } from "../../../types";
import { useHasBLSE } from "../../../blse";
import { getTableAttributes } from "../tableAttributes";

export const SavePage: FC = () => {
  const context = useContext(MainContext);
  const api = context.api;

  const localizationManager = useLocalization();
  const { localize: t } = localizationManager;

  const profile = useSelector(selectors.activeProfile);
  const saveName = useSelector((state: IStateWithBannerlord) =>
    profile !== undefined
      ? (bselectors.saveNameForProfile(state, profile.id) ?? "No Save")
      : "No Save",
  );
  const hasBLSE = useHasBLSE();

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
    async (saveId: string | null): Promise<void> => {
      if (profile) {
        store.dispatch(actionsSave.setCurrentSave(profile.id, saveId));
      }

      const launcherManager = VortexLauncherManager.getInstance(api);
      await launcherManager.setSaveFileAsync(saveId ?? "");
    },
    [profile, store, api],
  );

  const saveSelectedAsync = useCallback(
    async (save: ISaveGame): Promise<void> => {
      await setSaveAsync(save.index !== 0 ? save.name : null);
      setSelectedSave(save);
    },
    [setSaveAsync],
  );

  const reloadSavesAsync = useCallback(async (): Promise<void> => {
    try {
      const saveList = await getSavesAsync(api);
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
        await setSaveAsync(null);
      }
    } catch (err) {
      api.showErrorNotification?.(t("Failed to reload saves"), err);
    }
  }, [api, t, saveName, setSaveAsync]);

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
          t={api.translate}
        />
      </MainPage.Header>
      <MainPage.Body>
        <Content
          selectedSave={selectedSave}
          saveActions={saveActions}
          sortedSaveGameList={sortedSaveGameList}
          tableAttributes={getTableAttributes(
            api,
            hasBLSE,
            selectedSave,
            saveSelectedAsync,
          )}
          selectedRowSave={selectedRowSave}
          saveRowSelected={saveRowSelected}
        />
      </MainPage.Body>
    </MainPage>
  );
};

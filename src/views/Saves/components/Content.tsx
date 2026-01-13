import React from "react";
import { Panel } from "react-bootstrap";
import { FlexLayout, ITableRowAction, Table, types } from "vortex-api";
import { Sidebar } from "./Sidebar";
import { ISaveGame } from "../types";
import { useLocalization } from "../../../localization";

export type ContentProps = {
  selectedSave: ISaveGame | null;
  saveActions: ITableRowAction[];
  sortedSaveGameList: [string, ISaveGame][];
  tableAttributes: types.ITableAttribute<[string, ISaveGame]>[];
  selectedRowSave: ISaveGame | null;
  saveRowSelected: (save: ISaveGame) => void;
};

export const Content = (props: ContentProps): JSX.Element => {
  const {
    selectedSave,
    saveActions,
    sortedSaveGameList,
    tableAttributes,
    selectedRowSave,
    saveRowSelected,
  } = props;

  const { localize: t } = useLocalization();

  return (
    <Panel>
      <Panel.Body>
        <FlexLayout type="column">
          <FlexLayout.Fixed id="instructions">
            <p>
              {t(
                `Instructions: Select a row to see more information and use the radio buttons to select the save to ` +
                  `launch the game. If you don't want to launch with a save, choose the 'No Save' option at` +
                  `the top.`,
              )}
            </p>
            <p>
              {t(`Currently selected save: `)}
              {selectedSave?.name}
            </p>
          </FlexLayout.Fixed>

          <FlexLayout type="row">
            <FlexLayout.Flex>
              <Table
                tableId="bannerlord-savegames"
                data={sortedSaveGameList}
                staticElements={tableAttributes}
                actions={saveActions}
                multiSelect={false}
                hasActions={false}
                showDetails={false}
                onChangeSelection={(ids: string[]) =>
                  saveRowSelected(sortedSaveGameList[parseInt(ids[0]!)]![1])
                }
              />
            </FlexLayout.Flex>

            <FlexLayout.Fixed id="sidebar">
              <Sidebar save={selectedRowSave} />
            </FlexLayout.Fixed>
          </FlexLayout>
        </FlexLayout>
      </Panel.Body>
    </Panel>
  );
};

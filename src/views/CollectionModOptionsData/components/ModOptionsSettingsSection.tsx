import React, { FC } from "react";
import { ListGroup } from "react-bootstrap";
import { ModOptionsEntryView } from "./ModOptionsEntryView";
import { ModOptionsEntry, ModOptionsStorage } from "../../../modoptions";

export type ModOptionsSettingsSectionProps = {
  title: string;
  settings: ModOptionsStorage;
  isToggled: (entry: ModOptionsEntry) => boolean;
  toggleEntry: (newValue: boolean, entry: ModOptionsEntry) => void;
};

export const ModOptionsSettingsSection: FC<ModOptionsSettingsSectionProps> = (
  props,
) => {
  const { title, settings, isToggled, toggleEntry } = props;

  return (
    <div>
      <h5>{title}</h5>
      <ListGroup id="collections-load-order-list">
        {Object.values(settings).map((entry) => (
          <ModOptionsEntryView
            key={entry.name}
            entry={entry}
            isToggled={isToggled}
            toggleEntry={toggleEntry}
          />
        ))}
      </ListGroup>
    </div>
  );
};

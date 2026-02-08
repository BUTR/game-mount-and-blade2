import React, { FC } from "react";
import { types } from "vortex-api";
import { Radio } from "react-bootstrap";
import { ISaveGame } from "../types";

export type RadioViewProps = {
  api: types.IExtensionApi;
  save: ISaveGame;
  selectedSave: ISaveGame | null;
  hasBLSE: boolean;
  onChange: (save: ISaveGame) => void;
};

// Custom Renderer has no Context access
export const RadioView: FC<RadioViewProps> = (props) => {
  const { save, selectedSave, hasBLSE, onChange } = props;

  return hasBLSE ? (
    <Radio
      name="radioGroup"
      defaultChecked={save.name === selectedSave?.name}
      id={`bannerlord-savegames-radio${save.index}`}
      onChange={() => onChange(save)}
    />
  ) : null;
};

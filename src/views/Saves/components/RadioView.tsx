import React, { FC } from "react";
import { ISaveGame } from "../types";

export type RadioViewProps = {
  save: ISaveGame;
  checked: boolean;
  label: string;
  onChange: (save: ISaveGame) => Promise<void>;
};

// Custom Renderer has no Context access
// Controlled, so it follows the launch save when it is changed from the details panel or the launch bar
export const RadioView: FC<RadioViewProps> = (props) => {
  const { save, checked, label, onChange } = props;

  return (
    <input
      type="radio"
      className="bls-radio"
      name="bannerlord-savegames-launch"
      aria-label={label}
      checked={checked}
      onClick={(event) => event.stopPropagation()}
      onChange={() => void onChange(save)}
    />
  );
};

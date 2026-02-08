import React, { FC } from "react";
import { tooltip } from "vortex-api";
import { useLocalization } from "../../../localization";

export type SteamBinariesOnXboxProps = {
  hasSteamBinariesOnXbox: boolean;
};

export const SteamBinariesOnXbox: FC<SteamBinariesOnXboxProps> = (props) => {
  const { hasSteamBinariesOnXbox } = props;

  const { localize: t } = useLocalization();

  if (hasSteamBinariesOnXbox) {
    return (
      <tooltip.Icon
        className="nexus-id-invalid"
        name="feedback-warning"
        style={{ width: `1.5em`, height: `1.5em` }}
        tooltip={t(
          `Steam binaries are installed on Game Pass PC (Xbox) version of the game!`,
        )}
      />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};

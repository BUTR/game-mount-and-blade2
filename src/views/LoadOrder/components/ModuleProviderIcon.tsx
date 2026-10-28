import React, { FC } from "react";
import { IVortexViewModelData } from "@bannerlord/core/types";
import { TooltipImage } from "@bannerlord/ui/components/TooltipImage";
import { STEAM_LOGO } from "@bannerlord/core/common";
import { isSteamWorksop } from "../utils";
import { useLocalization } from "@bannerlord/core/localization/hooks";

export type ModuleProviderIconProps = {
  data: IVortexViewModelData | undefined;
};

export const ModuleProviderIcon: FC<ModuleProviderIconProps> = (props) => {
  const { data } = props;

  const { localize: t } = useLocalization();

  if (isSteamWorksop(data)) {
    return (
      <TooltipImage
        src={STEAM_LOGO}
        style={{ width: `1.5em`, height: `1.5em` }}
        tooltip={t("Managed by Steam")}
      />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};

import React, { FC } from "react";
import { tooltip } from "@nexusmods/vortex-api";
import { types as vetypes } from "@butr/vortexextensionnative";
import { IVortexViewModelData } from "../../../types";
import { useLocalization } from "../../../localization/hooks";

export type ModuleDuplicatesProps = {
  availableProviders: vetypes.ModuleProviderType[];
  data: IVortexViewModelData | undefined;
};

export const ModuleDuplicates: FC<ModuleDuplicatesProps> = (props) => {
  const { availableProviders, data } = props;

  const { localize: t } = useLocalization();

  // The game loads the /Modules copy before the Steam Workshop one, the warning is only true when there are both.
  // Two copies inside /Modules (Default and Vortex) aren't a Workshop conflict
  const onWorkshopAndInModules =
    availableProviders.includes(vetypes.ModuleProviderType.Steam) &&
    availableProviders.some(
      (provider) => provider !== vetypes.ModuleProviderType.Steam,
    );

  if (
    onWorkshopAndInModules &&
    data?.moduleInfoExtended.moduleProviderType !== undefined
  ) {
    return (
      <tooltip.Icon
        className="nexus-id-invalid"
        name="feedback-warning"
        style={{ width: `1.5em`, height: `1.5em` }}
        tooltip={t(
          `{=kfMQEOFS}The Module is installed in the game's /Modules folder and on Steam Workshop!{NL}` +
            `The /Modules version will be used!`,
        )}
      />
    );
  }

  return <div style={{ width: `1.5em`, height: `1.5em` }} />;
};
